import { describe, it, expect } from 'vitest';
import { applyPatchToInputs, validatePatch, diffResults, describePatch, type SchedulePatch } from './schedule-patch';
import type { Activity, AvailabilityBundle, ScheduleResult, ScheduledOccurrence } from './types';

const act = (over: Partial<Activity>): Activity => ({
  id: 'act-1',
  type: 'fitness',
  title: 'Brisk Walk',
  details: '',
  frequency: { count: 1, period: 'week' },
  durationMinutes: 30,
  priority: 1,
  facilitatorLabel: '',
  locations: [],
  canBeRemote: true,
  prep: [],
  resources: [],
  backupActivityIds: [],
  skipAdjustment: '',
  metrics: [],
  isBackupOnly: false,
  ...over,
});

const av: AvailabilityBundle = {
  windowStart: '2026-06-01',
  windowEnd: '2026-08-31',
  timeZone: 'UTC',
  memberBusy: [],
  travel: [],
  equipment: [],
  specialists: [],
  alliedHealth: [],
};

const occ = (over: Partial<ScheduledOccurrence>): ScheduledOccurrence => ({
  id: 'occ-act-1-2026-06-01',
  date: '2026-06-01',
  status: 'scheduled',
  sourceActivityId: 'act-1',
  title: 'Brisk Walk',
  type: 'fitness',
  details: '',
  facilitatorLabel: '',
  location: '',
  isRemote: true,
  prep: [],
  metrics: [],
  durationMinutes: 30,
  boundResources: [],
  reason: '',
  startTime: '07:00',
  endTime: '07:30',
  ...over,
});

const res = (occs: ScheduledOccurrence[]): ScheduleResult => ({
  windowStart: '2026-06-01',
  windowEnd: '2026-08-31',
  occurrences: occs,
});

describe('validatePatch', () => {
  const acts = [act({ id: 'act-1' })];
  it('rejects an unknown activity', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'nope', window: 'morning' }, acts)).toMatch(/Unknown activity/);
  });
  it('requires a window or anchor', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'act-1' }, acts)).toMatch(/window/i);
  });
  it('accepts a valid patch', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'act-1', window: 'evening' }, acts)).toBeNull();
  });
});

describe('applyPatchToInputs', () => {
  it('sets the activity preferred window from the patch window and leaves others untouched', () => {
    const acts = [act({ id: 'act-1' }), act({ id: 'act-2', title: 'Other' })];
    const patch: SchedulePatch = { kind: 'setTemporalPolicy', activityId: 'act-1', window: 'evening' };
    const { activities } = applyPatchToInputs(patch, acts, av);
    const a1 = activities.find((a) => a.id === 'act-1')!;
    expect(a1.temporalPolicy?.preferredWindows).toEqual([{ label: 'evening', startTime: '17:00', endTime: '21:00' }]);
    // unchanged activity keeps its identity (not re-policied)
    expect(activities.find((a) => a.id === 'act-2')).toBe(acts[1]);
    // input array not mutated
    expect(acts[0].temporalPolicy).toBeUndefined();
  });

  it('applies an anchor without a window', () => {
    const patch: SchedulePatch = { kind: 'setTemporalPolicy', activityId: 'act-1', anchor: 'dinner' };
    const { activities } = applyPatchToInputs(patch, [act({ id: 'act-1' })], av);
    expect(activities[0].temporalPolicy?.anchor).toBe('dinner');
  });
});

describe('diffResults', () => {
  it('detects a retime (same id, different startTime)', () => {
    const before = res([occ({ startTime: '07:00' })]);
    const after = res([occ({ startTime: '18:00' })]);
    const d = diffResults(before, after);
    expect(d.retimed).toHaveLength(1);
    expect(d.retimed[0]).toMatchObject({ from: '07:00', to: '18:00' });
    expect(d.totalChanged).toBe(1);
  });

  it('detects newly skipped and newly scheduled', () => {
    const before = res([occ({ id: 'a', status: 'scheduled' }), occ({ id: 'b', status: 'skipped', startTime: undefined })]);
    const after = res([occ({ id: 'a', status: 'skipped', startTime: undefined }), occ({ id: 'b', status: 'scheduled' })]);
    const d = diffResults(before, after);
    expect(d.nowSkipped.map((x) => x.id)).toEqual(['a']);
    expect(d.nowScheduled.map((x) => x.id)).toEqual(['b']);
    expect(d.totalChanged).toBe(2);
  });

  it('reports no change when results match', () => {
    const r = res([occ({})]);
    expect(diffResults(r, r).totalChanged).toBe(0);
  });
});

describe('describePatch', () => {
  it('names the activity and window', () => {
    expect(describePatch({ kind: 'setTemporalPolicy', activityId: 'act-1', window: 'morning' }, [act({ id: 'act-1', title: 'Brisk Walk' })])).toMatch(/Brisk Walk.*morning/);
  });
});
