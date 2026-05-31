/**
 * 019 Phase 1 — chat-context resolution tests.
 * buildContextIndex: a compact client index (travel/busy catalog/resources/bundle labels).
 * resolveContextRefs: one capped summary per typed ref; unresolvable ids fail loudly (never invent).
 */
import { describe, it, expect } from 'vitest';
import { buildContextIndex, resolveContextRefs, type ChatContextItem } from './chat-context';
import type {
  Activity,
  AllocationTrace,
  AvailabilityBundle,
  ScheduledOccurrence,
  ScheduleResult,
} from './types';

function occ(overrides: Partial<ScheduledOccurrence> & Pick<ScheduledOccurrence, 'id' | 'date' | 'status'>): ScheduledOccurrence {
  return {
    sourceActivityId: 'act-1',
    title: 'Brisk Walk',
    type: 'fitness',
    details: '',
    facilitatorLabel: 'Self',
    location: 'Home',
    isRemote: false,
    prep: [],
    metrics: [],
    durationMinutes: 30,
    boundResources: [],
    reason: 'placed',
    ...overrides,
  };
}

function act(overrides: Partial<Activity> & Pick<Activity, 'id' | 'title'>): Activity {
  return {
    type: 'fitness',
    details: '',
    frequency: { count: 1, period: 'day' },
    durationMinutes: 30,
    priority: 5,
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

function availability(overrides: Partial<AvailabilityBundle> = {}): AvailabilityBundle {
  return {
    windowStart: '2026-06-01',
    windowEnd: '2026-08-31',
    timeZone: 'America/Los_Angeles',
    memberBusy: [],
    travel: [
      { id: 'travel-01', destination: 'Singapore', blocked: [{ start: '2026-06-22', end: '2026-06-29' }] },
    ],
    equipment: [
      { id: 'eq-treadmill-01', role: 'treadmill', label: 'Home Treadmill', blocked: [{ start: '2026-07-06', end: '2026-07-12' }] },
    ],
    specialists: [
      { id: 'sp-cardio-01', role: 'cardiologist', name: 'Dr. Okafor', available: [{ start: '2026-07-01', end: '2026-07-03' }] },
    ],
    alliedHealth: [
      { id: 'ah-physio-01', role: 'physiotherapist', discipline: 'Physiotherapy', name: 'Jo Park', available: [{ start: '2026-06-01', end: '2026-08-31' }] },
    ],
    ...overrides,
  };
}

function result(occurrences: ScheduledOccurrence[]): ScheduleResult {
  return { windowStart: '2026-06-01', windowEnd: '2026-08-31', occurrences };
}

function ctx(ref: ChatContextItem['ref']): ChatContextItem {
  return { ref, provenance: 'atMention' };
}

function resolve(item: ChatContextItem, args: {
  result?: ScheduleResult;
  traces?: AllocationTrace[];
  activities?: Activity[];
  availability?: AvailabilityBundle;
}) {
  return resolveContextRefs({
    refs: [item],
    result: args.result ?? result([]),
    traces: args.traces ?? [],
    activities: args.activities ?? [],
    availability: args.availability ?? availability(),
  })[0];
}

describe('buildContextIndex', () => {
  it('flattens travel, busy catalog, resources, and distinct bundle labels', () => {
    const av = availability({
      memberBusy: [
        { id: 'mb-breakfast', title: 'Breakfast', category: 'meal', blocks: [{ date: '2026-06-01', startTime: '07:30', endTime: '08:00' }], blocksScheduling: true, visibleByDefault: true },
      ],
    });
    const res = result([
      occ({ id: 'occ-1', date: '2026-06-01', status: 'scheduled', displayBundleLabel: 'Morning meds' }),
      occ({ id: 'occ-2', date: '2026-06-02', status: 'scheduled', displayBundleLabel: 'Morning meds' }),
      occ({ id: 'occ-3', date: '2026-06-03', status: 'scheduled' }),
    ]);
    const index = buildContextIndex({ result: res, availability: av });

    expect(index.travel).toEqual([{ travelId: 'travel-01', destination: 'Singapore', startDate: '2026-06-22', endDate: '2026-06-29' }]);
    expect(index.busyBlocks).toEqual([{ busyBlockId: 'mb-breakfast', title: 'Breakfast', category: 'meal' }]);
    expect(index.resources).toEqual([
      { kind: 'equipment', role: 'treadmill', label: 'Home Treadmill' },
      { kind: 'specialist', role: 'cardiologist', label: 'Dr. Okafor' },
      { kind: 'alliedHealth', role: 'physiotherapist', label: 'Physiotherapy' },
    ]);
    expect(index.bundleLabels).toEqual(['Morning meds']);
  });
});

describe('resolveContextRefs', () => {
  it('summarizes an occurrence by date/time/status/title', () => {
    const res = result([occ({ id: 'occ-act-1-2026-06-22', date: '2026-06-22', status: 'scheduled', startTime: '07:30', endTime: '08:00', title: 'Remote Brisk Walk' })]);
    const r = resolve(ctx({ type: 'occurrence', occurrenceId: 'occ-act-1-2026-06-22' }), { result: res });
    expect(r.unresolved).toBeUndefined();
    expect(r.summary).toContain('2026-06-22');
    expect(r.summary).toContain('07:30-08:00');
    expect(r.summary).toContain('scheduled');
    expect(r.summary).toContain('Remote Brisk Walk');
  });

  it('marks an unknown occurrence id unresolved without inventing data', () => {
    const r = resolve(ctx({ type: 'occurrence', occurrenceId: 'occ-nope' }), {});
    expect(r.unresolved).toBe(true);
    expect(r.summary).toContain('not found');
  });

  it('summarizes a trace with its chosen score and reason', () => {
    const res = result([occ({ id: 'occ-1', date: '2026-06-22', status: 'substituted', reason: 'treadmill outage' })]);
    const traces: AllocationTrace[] = [{
      occurrenceId: 'occ-1',
      sourceActivityId: 'act-1',
      targetDate: '2026-06-22',
      attempts: [
        { candidateActivityId: 'act-1', isPrimary: true, feasible: false, boundResources: [], failedConstraints: [] },
        { candidateActivityId: 'act-2', isPrimary: false, feasible: true, boundResources: [], failedConstraints: [], score: 12 },
      ],
      chosenIndex: 1,
      status: 'substituted',
    }];
    const r = resolve(ctx({ type: 'trace', occurrenceId: 'occ-1' }), { result: res, traces });
    expect(r.summary).toContain('substituted');
    expect(r.summary).toContain('score 12');
    expect(r.summary).toContain('treadmill outage');
  });

  it('summarizes an activity by title/type/priority/frequency', () => {
    const activities = [act({ id: 'act-42', title: 'VO2 Max Primer', type: 'fitness', priority: 3, frequency: { count: 2, period: 'week' } })];
    const r = resolve(ctx({ type: 'activity', activityId: 'act-42' }), { activities });
    expect(r.summary).toContain('VO2 Max Primer');
    expect(r.summary).toContain('priority 3');
    expect(r.summary).toContain('2/week');
  });

  it('day ref reports what is scheduled AND what is missing with reasons', () => {
    const res = result([
      occ({ id: 'occ-1', date: '2026-06-22', status: 'scheduled' }),
      occ({ id: 'occ-2', date: '2026-06-22', status: 'skipped', title: 'In-person PT', reason: 'travel: Singapore' }),
      occ({ id: 'occ-3', date: '2026-06-22', status: 'substituted', title: 'Hotel Walk', reason: 'treadmill blocked' }),
    ]);
    const r = resolve(ctx({ type: 'day', date: '2026-06-22' }), { result: res });
    expect(r.summary).toContain('1 scheduled');
    expect(r.summary).toContain('1 substituted');
    expect(r.summary).toContain('1 skipped');
    expect(r.summary).toContain('travel: Singapore');
    expect(r.summary).toContain('treadmill blocked');
  });

  it('busyBlock ref echoes the instance fields it carries', () => {
    const r = resolve(ctx({ type: 'busyBlock', busyBlockId: 'mb-breakfast', date: '2026-06-22', startTime: '07:30', endTime: '08:00', title: 'Breakfast', category: 'meal' }), {});
    expect(r.summary).toContain('Breakfast');
    expect(r.summary).toContain('meal');
    expect(r.summary).toContain('07:30-08:00');
  });

  it('resource ref echoes equipment outage windows directly', () => {
    const r = resolve(ctx({ type: 'resource', kind: 'equipment', role: 'treadmill' }), {});
    expect(r.summary).toContain('2026-07-06..2026-07-12');
  });

  it('resource ref inverts specialist availability into outage windows', () => {
    const r = resolve(ctx({ type: 'resource', kind: 'specialist', role: 'cardiologist' }), {});
    // available only 2026-07-01..07-03, so the rest of the window is unavailable.
    expect(r.summary).toContain('2026-06-01..2026-06-30');
    expect(r.summary).toContain('2026-07-04..2026-08-31');
  });

  it('marks an unknown resource role unresolved', () => {
    const r = resolve(ctx({ type: 'resource', kind: 'equipment', role: 'jetpack' }), {});
    expect(r.unresolved).toBe(true);
  });

  it('travelWindow ref counts occurrences affected in the range from live availability', () => {
    const res = result([
      occ({ id: 'occ-1', date: '2026-06-22', status: 'skipped' }),
      occ({ id: 'occ-2', date: '2026-06-25', status: 'substituted' }),
      occ({ id: 'occ-3', date: '2026-07-01', status: 'scheduled' }),
    ]);
    const r = resolve(ctx({ type: 'travelWindow', travelId: 'travel-01' }), { result: res });
    expect(r.summary).toContain('Singapore');
    expect(r.summary).toContain('2026-06-22..2026-06-29');
    expect(r.summary).toContain('2 occurrence');
  });

  it('marks an unknown travel id unresolved', () => {
    const r = resolve(ctx({ type: 'travelWindow', travelId: 'travel-99' }), {});
    expect(r.unresolved).toBe(true);
  });

  it('bundle ref counts the label on that date', () => {
    const res = result([
      occ({ id: 'occ-1', date: '2026-06-22', status: 'scheduled', displayBundleLabel: 'Morning meds' }),
      occ({ id: 'occ-2', date: '2026-06-22', status: 'scheduled', displayBundleLabel: 'Morning meds' }),
      occ({ id: 'occ-3', date: '2026-06-22', status: 'scheduled' }),
    ]);
    const r = resolve(ctx({ type: 'bundle', date: '2026-06-22', label: 'Morning meds' }), { result: res });
    expect(r.summary).toContain('2 occurrence');
  });

  it('timeBlock ref reports overlap with a busy block', () => {
    const av = availability({
      memberBusy: [
        { id: 'mb-breakfast', title: 'Breakfast', category: 'meal', blocks: [{ date: '2026-06-22', startTime: '07:30', endTime: '08:00' }], blocksScheduling: true, visibleByDefault: true },
      ],
    });
    const overlap = resolve(ctx({ type: 'timeBlock', date: '2026-06-22', startTime: '07:45', endTime: '08:15', source: 'calendar' }), { availability: av });
    expect(overlap.summary).toContain('overlaps a busy block');
    const clear = resolve(ctx({ type: 'timeBlock', date: '2026-06-22', startTime: '09:00', endTime: '09:30', source: 'calendar' }), { availability: av });
    expect(clear.summary).toContain('no busy-block overlap');
  });

  it('scheduleRange ref buckets counts by month', () => {
    const res = result([
      occ({ id: 'occ-1', date: '2026-06-10', status: 'scheduled' }),
      occ({ id: 'occ-2', date: '2026-06-20', status: 'scheduled' }),
      occ({ id: 'occ-3', date: '2026-07-05', status: 'scheduled' }),
      occ({ id: 'occ-4', date: '2026-09-01', status: 'scheduled' }),
    ]);
    const r = resolve(ctx({ type: 'scheduleRange', startDate: '2026-06-01', endDate: '2026-08-31' }), { result: res });
    expect(r.summary).toContain('2026-06: 2');
    expect(r.summary).toContain('2026-07: 1');
    expect(r.summary).not.toContain('2026-09');
  });

  it('preserves provenance on each resolved context', () => {
    const item: ChatContextItem = { ref: { type: 'day', date: '2026-06-22' }, provenance: 'pinned' };
    const [r] = resolveContextRefs({ refs: [item], result: result([]), traces: [], activities: [], availability: availability() });
    expect(r.provenance).toBe('pinned');
  });
});
