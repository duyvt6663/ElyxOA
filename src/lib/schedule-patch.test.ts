import { describe, it, expect } from 'vitest';
import { applyPatchToInputs, validatePatch, diffResults, describePatch, type SchedulePatch } from './schedule-patch';
import { scheduleTemporal } from './temporal-scheduler';
import type { Activity, AvailabilityBundle, ScheduleResult, ScheduledOccurrence } from './types';
import activitiesData from '../data/activities.json';
import availabilityData from '../data/availability.json';

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

const avRich: AvailabilityBundle = {
  ...av,
  memberBusy: [
    { id: 'mb-1', title: 'Lunch', category: 'meal', blocks: [{ date: '2026-06-03', startTime: '12:00', endTime: '13:00' }], blocksScheduling: true, visibleByDefault: true },
  ],
  travel: [{ id: 'tr-1', destination: 'Singapore', blocked: [{ start: '2026-06-22', end: '2026-06-29' }] }],
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

const res = (occs: ScheduledOccurrence[]): ScheduleResult => ({ windowStart: '2026-06-01', windowEnd: '2026-08-31', occurrences: occs });

describe('validatePatch', () => {
  const acts = [act({ id: 'act-1' })];
  it('rejects an unknown activity', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'nope', window: 'morning' }, acts, av)).toMatch(/Unknown activity/);
  });
  it('requires a window or anchor', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'act-1' }, acts, av)).toMatch(/window/i);
  });
  it('accepts a valid setTemporalPolicy', () => {
    expect(validatePatch({ kind: 'setTemporalPolicy', activityId: 'act-1', window: 'evening' }, acts, av)).toBeNull();
  });
  it('rejects an addBusyBlock with bad times', () => {
    expect(validatePatch({ kind: 'addBusyBlock', date: '2026-06-24', startTime: '20:00', endTime: '18:00', title: 'Dinner', category: 'meal' }, acts, av)).toMatch(/before/);
  });
  it('accepts a valid addBusyBlock', () => {
    expect(validatePatch({ kind: 'addBusyBlock', date: '2026-06-24', startTime: '18:00', endTime: '20:00', title: 'Dinner', category: 'meal' }, acts, av)).toBeNull();
  });
  it('rejects removeBusyBlock for an unknown id', () => {
    expect(validatePatch({ kind: 'removeBusyBlock', busyBlockId: 'nope' }, acts, av)).toMatch(/Unknown busy block/);
  });
  it('accepts removeBusyBlock for a known id', () => {
    expect(validatePatch({ kind: 'removeBusyBlock', busyBlockId: 'mb-1', date: '2026-06-03' }, acts, avRich)).toBeNull();
  });
  it('rejects editTravelWindow with inverted dates', () => {
    expect(validatePatch({ kind: 'editTravelWindow', travelId: 'tr-1', startDate: '2026-06-29', endDate: '2026-06-22' }, acts, avRich)).toMatch(/on or before/);
  });
  it('accepts a valid editTravelWindow', () => {
    expect(validatePatch({ kind: 'editTravelWindow', travelId: 'tr-1', startDate: '2026-06-22', endDate: '2026-06-30' }, acts, avRich)).toBeNull();
  });
  it('rejects addTravelWindow with an empty destination', () => {
    expect(validatePatch({ kind: 'addTravelWindow', destination: '  ', startDate: '2026-07-10', endDate: '2026-07-15' }, acts, av)).toMatch(/destination/i);
  });
  it('rejects addTravelWindow with inverted dates', () => {
    expect(validatePatch({ kind: 'addTravelWindow', destination: 'Paris', startDate: '2026-07-15', endDate: '2026-07-10' }, acts, av)).toMatch(/on or before/);
  });
  it('accepts a valid addTravelWindow', () => {
    expect(validatePatch({ kind: 'addTravelWindow', destination: 'Paris', startDate: '2026-07-10', endDate: '2026-07-15', timeZone: 'Europe/Paris' }, acts, av)).toBeNull();
  });
});

describe('applyPatchToInputs', () => {
  it('setTemporalPolicy sets the preferred window and leaves others untouched', () => {
    const acts = [act({ id: 'act-1' }), act({ id: 'act-2', title: 'Other' })];
    const { activities } = applyPatchToInputs({ kind: 'setTemporalPolicy', activityId: 'act-1', window: 'evening' }, acts, av);
    expect(activities.find((a) => a.id === 'act-1')!.temporalPolicy?.preferredWindows).toEqual([{ label: 'evening', startTime: '17:00', endTime: '21:00' }]);
    expect(activities.find((a) => a.id === 'act-2')).toBe(acts[1]);
    expect(acts[0].temporalPolicy).toBeUndefined();
  });

  it('addBusyBlock appends a blocking member-busy block', () => {
    const { availability } = applyPatchToInputs({ kind: 'addBusyBlock', date: '2026-06-24', startTime: '18:00', endTime: '20:00', title: 'Dinner', category: 'meal' }, [], av);
    expect(availability.memberBusy).toHaveLength(1);
    expect(availability.memberBusy[0]).toMatchObject({ category: 'meal', blocksScheduling: true });
    expect(availability.memberBusy[0].blocks[0]).toMatchObject({ date: '2026-06-24', startTime: '18:00', endTime: '20:00' });
  });

  it('removeBusyBlock (date-scoped) drops the instance, emptying the block', () => {
    const { availability } = applyPatchToInputs({ kind: 'removeBusyBlock', busyBlockId: 'mb-1', date: '2026-06-03' }, [], avRich);
    expect(availability.memberBusy).toHaveLength(0);
  });

  it('removeBusyBlock (no date) removes the whole recurring group', () => {
    const rich = { ...avRich, memberBusy: [{ ...avRich.memberBusy[0], blocks: [...avRich.memberBusy[0].blocks, { date: '2026-06-10', startTime: '12:00' as const, endTime: '13:00' as const }] }] };
    const { availability } = applyPatchToInputs({ kind: 'removeBusyBlock', busyBlockId: 'mb-1' }, [], rich);
    expect(availability.memberBusy).toHaveLength(0);
  });

  it('editTravelWindow updates the blocked range', () => {
    const { availability } = applyPatchToInputs({ kind: 'editTravelWindow', travelId: 'tr-1', startDate: '2026-06-22', endDate: '2026-06-30' }, [], avRich);
    expect(availability.travel[0].blocked).toEqual([{ start: '2026-06-22', end: '2026-06-30' }]);
  });

  it('addTravelWindow appends a new trip (generated id + timezone) without mutating the original', () => {
    const { availability } = applyPatchToInputs({ kind: 'addTravelWindow', destination: 'Paris', startDate: '2026-07-10', endDate: '2026-07-15', timeZone: 'Europe/Paris' }, [], avRich);
    expect(availability.travel).toHaveLength(2); // existing Singapore + new Paris
    const paris = availability.travel.find((t) => t.destination === 'Paris')!;
    expect(paris.id).toBe('travel-draft-paris-2026-07-10');
    expect(paris.timeZone).toBe('Europe/Paris');
    expect(paris.blocked).toEqual([{ start: '2026-07-10', end: '2026-07-15' }]);
    expect(avRich.travel).toHaveLength(1); // input not mutated
  });
});

describe('diffResults', () => {
  it('detects a retime (same id+date, different startTime)', () => {
    const d = diffResults(res([occ({ startTime: '07:00' })]), res([occ({ startTime: '18:00' })]));
    expect(d.retimed).toHaveLength(1);
    expect(d.retimed[0]).toMatchObject({ from: '07:00', to: '18:00' });
    expect(d.totalChanged).toBe(1);
  });

  it('detects a day move (same id, different date)', () => {
    const d = diffResults(res([occ({ date: '2026-06-22' })]), res([occ({ date: '2026-06-23' })]));
    expect(d.movedDay).toHaveLength(1);
    expect(d.movedDay[0].from).toContain('2026-06-22');
    expect(d.movedDay[0].to).toContain('2026-06-23');
    expect(d.retimed).toHaveLength(0);
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
    expect(describePatch({ kind: 'setTemporalPolicy', activityId: 'act-1', window: 'morning' }, [act({ id: 'act-1', title: 'Brisk Walk' })], av)).toMatch(/Brisk Walk.*morning/);
  });
  it('describes a travel edit with the destination', () => {
    expect(describePatch({ kind: 'editTravelWindow', travelId: 'tr-1', startDate: '2026-06-22', endDate: '2026-06-30' }, [], avRich)).toMatch(/Singapore.*2026-06-30/);
  });
  it('describes a new trip with the destination + dates', () => {
    expect(describePatch({ kind: 'addTravelWindow', destination: 'Paris', startDate: '2026-07-10', endDate: '2026-07-15' }, [], av)).toMatch(/Add Paris.*2026-07-10.*2026-07-15/);
  });
});

// End-to-end: a new trip reschedules its days. Uses the real fixtures + the temporal scheduler to
// prove that adding travel forces location-bound actions to fall back (substitute) or skip.
describe('addTravelWindow reschedules the trip days', () => {
  const activities = activitiesData as unknown as Activity[];
  const availability = availabilityData as unknown as AvailabilityBundle;

  it('increases adaptations (substituted/skipped) after adding a trip to a previously trip-free week', () => {
    const baseline = scheduleTemporal(activities, availability).result;
    // 2026-07-06..2026-07-10 is a Mon–Fri with no existing trip (trips are Jun 22–29 + Aug 10–14).
    const patched = applyPatchToInputs(
      { kind: 'addTravelWindow', destination: 'Paris', startDate: '2026-07-06', endDate: '2026-07-10', timeZone: 'Europe/Paris' },
      activities,
      availability,
    );
    const after = scheduleTemporal(patched.activities, patched.availability).result;
    const adapt = (r: ScheduleResult) => r.occurrences.filter((o) => o.status !== 'scheduled').length;
    expect(adapt(after)).toBeGreaterThan(adapt(baseline));
  });
});
