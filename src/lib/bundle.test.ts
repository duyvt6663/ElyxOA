/**
 * 016 §11 — display-bundle eligibility tests. The guardrail is the point: bundles must only
 * ever collapse scheduled, low-risk, daily food/med with no resource requirement.
 */
import { describe, it, expect } from 'vitest';
import { bundleAssignment } from './bundle';
import type { Activity, ActivityTemporalPolicy } from './types';

function act(overrides: Partial<Activity> & Pick<Activity, 'id' | 'type' | 'title' | 'frequency'>): Activity {
  return {
    details: '',
    durationMinutes: 5,
    priority: 1,
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
const pol = (anchor: ActivityTemporalPolicy['anchor']): ActivityTemporalPolicy => ({ preferredWindows: [], anchor });

describe('bundleAssignment', () => {
  it('bundles a daily no-resource medication into Morning meds', () => {
    const a = act({ id: 'm1', type: 'medication', title: 'Morning Antihypertensive', frequency: { count: 1, period: 'day' } });
    expect(bundleAssignment(a, pol('breakfast'))).toEqual({ bundleId: 'morning-meds', label: 'Morning meds' });
  });

  it('keys wake + breakfast meds to the SAME bundle (same label)', () => {
    const a = act({ id: 'm', type: 'medication', title: 'Pill', frequency: { count: 1, period: 'day' } });
    expect(bundleAssignment(a, pol('wake'))!.bundleId).toBe(bundleAssignment(a, pol('breakfast'))!.bundleId);
  });

  it('bundles daily food by anchor', () => {
    const a = act({ id: 'f', type: 'food', title: 'Fiber Booster', frequency: { count: 1, period: 'day' } });
    expect(bundleAssignment(a, pol('lunch'))).toEqual({ bundleId: 'lunch-nutrition', label: 'Lunch nutrition' });
  });

  it('does NOT bundle a monitoring med (has a device resource)', () => {
    const a = act({ id: 'bp', type: 'medication', title: 'Blood Pressure Log', frequency: { count: 1, period: 'day' }, resources: [{ kind: 'equipment', role: 'bp-cuff' }] });
    expect(bundleAssignment(a, pol('breakfast'))).toBeNull();
  });

  it('does NOT bundle weekly/monthly food/med', () => {
    const a = act({ id: 'w', type: 'medication', title: 'Weekly Injection', frequency: { count: 1, period: 'week' } });
    expect(bundleAssignment(a, pol('breakfast'))).toBeNull();
  });

  it('does NOT bundle fitness/therapy/consultation', () => {
    expect(bundleAssignment(act({ id: 'x', type: 'fitness', title: 'Walk', frequency: { count: 1, period: 'day' } }), pol('any'))).toBeNull();
    expect(bundleAssignment(act({ id: 'y', type: 'therapy', title: 'Downshift', frequency: { count: 1, period: 'day' } }), pol('bedtime'))).toBeNull();
    expect(bundleAssignment(act({ id: 'z', type: 'consultation', title: 'Review', frequency: { count: 1, period: 'day' } }), pol('any'))).toBeNull();
  });

  it('honors label overrides', () => {
    const a = act({ id: 'm', type: 'medication', title: 'Pill', frequency: { count: 1, period: 'day' } });
    const r = bundleAssignment(a, pol('breakfast'), { 'medication:breakfast': 'AM pills' });
    expect(r).toEqual({ bundleId: 'am-pills', label: 'AM pills' });
  });
});
