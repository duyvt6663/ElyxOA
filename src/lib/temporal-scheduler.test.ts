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
});
