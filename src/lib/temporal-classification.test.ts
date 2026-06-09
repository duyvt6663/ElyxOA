/**
 * DECISION RECAP — 026 overlap-classification tests
 * - Locks the Trace-tab overlap note's classification: consultation vs quick vs none, resolved by the
 *   EFFECTIVE placed action, with skipped occurrences producing no note.
 */

import { describe, it, expect } from 'vitest';
import { isBlockingActivity, overlapExplanationKind } from './temporal-classification';
import { getDefaultTemporalPolicy } from './temporal-policy';
import type { Activity, ActivityTemporalPolicy, ScheduledOccurrence } from './types';

function act(
  over: Partial<Activity> & Pick<Activity, 'id' | 'type' | 'title' | 'durationMinutes'>,
): Activity {
  return {
    details: '',
    frequency: { count: 1, period: 'day' },
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
    ...over,
  };
}

const policyFor = (a: Activity): ActivityTemporalPolicy => a.temporalPolicy ?? getDefaultTemporalPolicy(a);

const consult = act({ id: 'c', type: 'consultation', title: 'Cardiology Review', durationMinutes: 30 });
const pill = act({ id: 'p', type: 'medication', title: 'Morning Pill', durationMinutes: 5 });
const lowWalk = act({ id: 'w', type: 'fitness', title: 'Outdoor Brisk Walk', durationMinutes: 30, temporalPolicy: { preferredWindows: [], intensity: 'low' } });
const strength = act({ id: 's', type: 'fitness', title: 'Lower Body Strength', durationMinutes: 60, temporalPolicy: { preferredWindows: [], intensity: 'moderate' } });
const byId = new Map([consult, pill, lowWalk, strength].map((a) => [a.id, a] as const));

const occ = (over: Pick<ScheduledOccurrence, 'status' | 'effectiveActivityId' | 'sourceActivityId'>) => over;

describe('overlapExplanationKind (026)', () => {
  it('consultation → consultation note', () => {
    expect(overlapExplanationKind(occ({ status: 'scheduled', sourceActivityId: 'c', effectiveActivityId: 'c' }), byId, policyFor)).toBe('consultation');
  });

  it('short medication → quick', () => {
    expect(overlapExplanationKind(occ({ status: 'scheduled', sourceActivityId: 'p', effectiveActivityId: 'p' }), byId, policyFor)).toBe('quick');
  });

  it('low-intensity fitness with duration ≥ 20 → quick', () => {
    expect(overlapExplanationKind(occ({ status: 'scheduled', sourceActivityId: 'w', effectiveActivityId: 'w' }), byId, policyFor)).toBe('quick');
  });

  it('60-min strength → no note (blocking)', () => {
    expect(overlapExplanationKind(occ({ status: 'scheduled', sourceActivityId: 's', effectiveActivityId: 's' }), byId, policyFor)).toBeNull();
  });

  it('skipped occurrence → no note', () => {
    expect(overlapExplanationKind(occ({ status: 'skipped', sourceActivityId: 'c', effectiveActivityId: 'c' }), byId, policyFor)).toBeNull();
  });

  it('substituted → classifies by effectiveActivityId (the fallback), not the source', () => {
    // source is a blocking strength (would be null); the placed fallback is the quick walk → quick
    expect(overlapExplanationKind(occ({ status: 'substituted', sourceActivityId: 's', effectiveActivityId: 'w' }), byId, policyFor)).toBe('quick');
  });

  it('isBlockingActivity: low fitness and short actions are quick; long focused is blocking', () => {
    expect(isBlockingActivity(lowWalk, policyFor(lowWalk))).toBe(false);
    expect(isBlockingActivity(pill, policyFor(pill))).toBe(false);
    expect(isBlockingActivity(strength, policyFor(strength))).toBe(true);
  });
});
