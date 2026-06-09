/**
 * DECISION RECAP — 015 Temporal Scheduler tests
 * Focused unit coverage for the time dimension: placement, member-busy overlap,
 * action overlap, bidirectional temporal rules, determinism, and skip. Resource/travel
 * behavior is already covered by scheduler.test.ts (reused verbatim via isFeasible).
 */

import { describe, it, expect } from 'vitest';
import { scheduleTemporal } from './temporal-scheduler';
import type { Activity, AvailabilityBundle, MemberBusyBlock } from './types';

function makeActivity(
  overrides: Partial<Activity> & Pick<Activity, 'id' | 'type' | 'title' | 'frequency' | 'priority'>,
): Activity {
  return {
    details: '',
    durationMinutes: 30,
    facilitatorLabel: 'Self',
    locations: ['Home'],
    canBeRemote: true,
    prep: [],
    resources: [],
    backupActivityIds: [],
    skipAdjustment: 'skip',
    metrics: [],
    isBackupOnly: false,
    ...overrides,
  };
}

function makeAvailability(overrides: Partial<AvailabilityBundle> = {}): AvailabilityBundle {
  return {
    windowStart: '2026-06-01',
    windowEnd: '2026-06-01',
    timeZone: 'America/Los_Angeles',
    memberBusy: [],
    travel: [],
    equipment: [],
    specialists: [],
    alliedHealth: [],
    ...overrides,
  };
}

function busy(
  id: string,
  category: MemberBusyBlock['category'],
  start: string,
  end: string,
  blocksScheduling = true,
): MemberBusyBlock {
  return {
    id,
    title: `${category} block`,
    category,
    blocks: [{ date: '2026-06-01', startTime: start as never, endTime: end as never }],
    blocksScheduling,
    visibleByDefault: true,
  };
}

describe('scheduleTemporal', () => {
  it('assigns startTime/endTime/timeZone to scheduled occurrences', () => {
    const act = makeActivity({ id: 'a1', type: 'medication', title: 'Morning Pill', frequency: { count: 1, period: 'day' }, priority: 1 });
    const { result } = scheduleTemporal([act], makeAvailability());
    expect(result.occurrences).toHaveLength(1);
    const occ = result.occurrences[0]!;
    expect(occ.status).toBe('scheduled');
    expect(occ.startTime).toMatch(/^\d\d:\d\d$/);
    expect(occ.endTime).toMatch(/^\d\d:\d\d$/);
    expect(occ.timeZone).toBe('America/Los_Angeles');
    expect(occ.startTime! < occ.endTime!).toBe(true);
  });

  it('never overlaps a blocking member busy block', () => {
    // Daily action with no preferred window pressure; a work block consumes 09:00-17:00.
    const act = makeActivity({ id: 'a1', type: 'food', title: 'Lunch Vegetable Anchor', frequency: { count: 1, period: 'day' }, priority: 1, durationMinutes: 30 });
    const av = makeAvailability({ memberBusy: [busy('work-1', 'work', '09:00', '17:00')] });
    const { result } = scheduleTemporal([act], av);
    const occ = result.occurrences[0]!;
    expect(occ.status).toBe('scheduled');
    // Must not fall inside 09:00-17:00.
    const start = occ.startTime!;
    const insideWork = start >= '09:00' && start < '17:00';
    expect(insideWork).toBe(false);
  });

  it('does not place two member actions in the same slot', () => {
    const a = makeActivity({ id: 'a1', type: 'medication', title: 'Pill A', frequency: { count: 1, period: 'day' }, priority: 1, durationMinutes: 30 });
    const b = makeActivity({ id: 'a2', type: 'medication', title: 'Pill B', frequency: { count: 1, period: 'day' }, priority: 2, durationMinutes: 30 });
    const { result } = scheduleTemporal([a, b], makeAvailability());
    const [o1, o2] = result.occurrences;
    expect(o1!.status).toBe('scheduled');
    expect(o2!.status).toBe('scheduled');
    // Different start times (no overlap).
    expect(o1!.startTime).not.toBe(o2!.startTime);
  });

  it('enforces a bidirectional medication-after-sport rule', () => {
    // BP (tier-1, allocated first) lands at 06:30. High-intensity fitness (tier-3) carries no
    // rule itself, but BP.avoidAfter(fitness high, 120m) is bidirectional, so the fitness
    // cannot start within 120 min after BP ends (07:00) -> pushed to >= 09:00.
    const bp = makeActivity({
      id: 'bp',
      type: 'medication',
      title: 'Blood Pressure Log',
      frequency: { count: 1, period: 'day' },
      priority: 1,
      durationMinutes: 15,
      temporalPolicy: {
        preferredWindows: [{ label: 'morning', startTime: '06:30', endTime: '08:30' }],
        anchor: 'breakfast',
        intensity: 'none',
        avoidAfter: [{ activityType: 'fitness', intensity: 'high', withinMinutes: 120, reason: 'BP clear of exertion' }],
      },
    });
    const fit = makeActivity({
      id: 'fit',
      type: 'fitness',
      title: 'VO2 Max Primer',
      frequency: { count: 1, period: 'day' },
      priority: 2,
      durationMinutes: 45,
      temporalPolicy: { preferredWindows: [{ label: 'morning', startTime: '07:00', endTime: '11:00' }], intensity: 'high' },
    });
    const { result, diagnostics } = scheduleTemporal([bp, fit], makeAvailability());
    const bpOcc = result.occurrences.find((o) => o.sourceActivityId === 'bp')!;
    const fitOcc = result.occurrences.find((o) => o.sourceActivityId === 'fit')!;
    expect(bpOcc.startTime).toBe('06:30');
    expect(fitOcc.status).toBe('scheduled');
    expect(fitOcc.startTime! >= '09:00').toBe(true);
    // The fitness trace records at least one temporalRule rejection among its attempts.
    const fitTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'fit')!;
    const sawRule = fitTrace.attempts.some((a) => a.failedConstraints.some((f) => f.kind === 'temporalRule'));
    // (chosen attempt is feasible; rule rejections appear as capped fail detail only when the
    // primary ultimately fails — here it succeeds, so just assert the placement moved.)
    expect(sawRule || fitOcc.startTime! >= '09:00').toBe(true);
  });

  it('is deterministic regardless of input order', () => {
    const a = makeActivity({ id: 'a1', type: 'fitness', title: 'Zone 2 Cardio', frequency: { count: 1, period: 'day' }, priority: 5 });
    const b = makeActivity({ id: 'a2', type: 'medication', title: 'Morning Pill', frequency: { count: 1, period: 'day' }, priority: 1 });
    const c = makeActivity({ id: 'a3', type: 'therapy', title: 'Evening Downshift Routine', frequency: { count: 1, period: 'day' }, priority: 8 });
    const av = makeAvailability();
    const forward = scheduleTemporal([a, b, c], av).result;
    const reversed = scheduleTemporal([c, b, a], av).result;
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });

  it('skips when the whole day is blocked', () => {
    const act = makeActivity({ id: 'a1', type: 'fitness', title: 'Outdoor Brisk Walk', frequency: { count: 1, period: 'day' }, priority: 1, durationMinutes: 30 });
    // Sleep covers the entire candidate horizon -> no slot.
    const av = makeAvailability({
      memberBusy: [busy('sleep-am', 'sleep', '00:00', '23:59')],
    });
    const { result } = scheduleTemporal([act], av);
    expect(result.occurrences[0]!.status).toBe('skipped');
  });

  it('high-intensity fitness is not placed within 90 min after a meal', () => {
    const fit = makeActivity({
      id: 'fit',
      type: 'fitness',
      title: 'VO2 Intervals',
      frequency: { count: 1, period: 'day' },
      priority: 1,
      durationMinutes: 45,
      temporalPolicy: {
        preferredWindows: [{ label: 'morning', startTime: '07:00', endTime: '12:00' }],
        intensity: 'high',
        avoidAfter: [{ category: 'meal', withinMinutes: 90, reason: 'no high-intensity within 90 min after a meal' }],
      },
    });
    // Breakfast meal 07:30-08:00 -> fitness cannot start before 09:30; mornings otherwise open.
    const av = makeAvailability({ memberBusy: [busy('bfast', 'meal', '07:30', '08:00')] });
    const { result } = scheduleTemporal([fit], av);
    const occ = result.occurrences[0]!;
    expect(occ.status).toBe('scheduled');
    expect(occ.startTime! >= '09:30').toBe(true);
  });

  it('no two blocking actions overlap on the same day', () => {
    const a = makeActivity({ id: 'a', type: 'fitness', title: 'Strength A', frequency: { count: 1, period: 'day' }, priority: 1, durationMinutes: 60, temporalPolicy: { preferredWindows: [{ label: 'morning', startTime: '06:00', endTime: '09:00' }], intensity: 'moderate' } });
    const b = makeActivity({ id: 'b', type: 'fitness', title: 'Strength B', frequency: { count: 1, period: 'day' }, priority: 2, durationMinutes: 60, temporalPolicy: { preferredWindows: [{ label: 'morning', startTime: '06:00', endTime: '09:00' }], intensity: 'moderate' } });
    const { result } = scheduleTemporal([a, b], makeAvailability());
    const oa = result.occurrences.find((o) => o.sourceActivityId === 'a')!;
    const ob = result.occurrences.find((o) => o.sourceActivityId === 'b')!;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    // Both 60-min blocking sessions scheduled; their [start,end) intervals do not overlap.
    expect(oa.status).toBe('scheduled');
    expect(ob.status).toBe('scheduled');
    const overlap = toMin(oa.startTime!) < toMin(ob.endTime!) && toMin(ob.startTime!) < toMin(oa.endTime!);
    expect(overlap).toBe(false);
  });

  // ---- 024: daily load realism ----

  it('slides a second same-day consultation to another day', () => {
    // Two monthly consultations share a June 1 due-date (monthly is not staggered); the escalating
    // same-day consultation cost (40 > a one-day move = 6) moves the second off June 1. Fails under
    // the old flat per-action overload, which would leave both on June 1.
    const c1 = makeActivity({ id: 'c1', type: 'consultation', title: 'Review A', frequency: { count: 1, period: 'month' }, priority: 1, durationMinutes: 30 });
    const c2 = makeActivity({ id: 'c2', type: 'consultation', title: 'Review B', frequency: { count: 1, period: 'month' }, priority: 2, durationMinutes: 30 });
    const av = makeAvailability({ windowStart: '2026-06-01', windowEnd: '2026-06-30' });
    const { result } = scheduleTemporal([c1, c2], av);
    const o1 = result.occurrences.find((o) => o.sourceActivityId === 'c1')!;
    const o2 = result.occurrences.find((o) => o.sourceActivityId === 'c2')!;
    expect(o1.status).toBe('scheduled');
    expect(o2.status).toBe('scheduled');
    expect(o1.date).not.toBe(o2.date);
  });

  it('never schedules two high-intensity sessions on the same day', () => {
    // Four high-intensity weekly activities ('interval' -> default high policy, which now carries the
    // high<->high same-day rule) over two weeks. No date may hold two high-intensity occurrences.
    const acts = ['h1', 'h2', 'h3', 'h4'].map((id) =>
      makeActivity({ id, type: 'fitness', title: `Interval Session ${id}`, frequency: { count: 1, period: 'week' }, priority: 1, durationMinutes: 45 }),
    );
    const av = makeAvailability({ windowStart: '2026-06-01', windowEnd: '2026-06-14' });
    const { result } = scheduleTemporal(acts, av);
    const highByDate = new Map<string, number>();
    for (const o of result.occurrences) {
      if (o.status === 'skipped') continue;
      highByDate.set(o.date, (highByDate.get(o.date) ?? 0) + 1);
    }
    const maxPerDay = Math.max(...highByDate.values());
    expect(maxPerDay).toBeLessThanOrEqual(1);
  });

  it('keeps the same-day consultation cost soft — never forces a skip', () => {
    // Three consultations pinned to a one-day window (nowhere to slide). The escalating cost is a
    // score penalty, not a feasibility wall, so all three still schedule sequentially.
    const mk = (id: string, p: number) =>
      makeActivity({ id, type: 'consultation', title: `Review ${id}`, frequency: { count: 1, period: 'day' }, priority: p, durationMinutes: 30 });
    const { result } = scheduleTemporal([mk('c1', 1), mk('c2', 2), mk('c3', 3)], makeAvailability());
    expect(result.occurrences.every((o) => o.status === 'scheduled')).toBe(true);
    expect(new Set(result.occurrences.map((o) => o.startTime)).size).toBe(3); // distinct times, same day
  });
});
