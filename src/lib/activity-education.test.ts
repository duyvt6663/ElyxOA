/**
 * 023 Phase 1 — education validator + lookup + deterministic-fallback tests.
 * The guardrails are the point: the committed education set must always be 116 valid, safe,
 * sorted profiles, and the lookup must resolve scheduled / substituted (fallback) / skipped
 * occurrences to the right activity id.
 */
import { describe, it, expect } from 'vitest';
import { validateEducationProfiles, isActivityEducationProfile } from './validate';
import { buildEducationMap, educationForActivity, educationForOccurrence } from './activity-education';
// The generator is a plain .mjs script (no types); type its one exported helper at the boundary.
// @ts-expect-error -- untyped .mjs module imported only by this test.
import { fallbackProfile as fallbackProfileUntyped } from '../../scripts/generate-activity-education.mjs';
import type { Activity, ActivityEducationProfile, ActivityType, ScheduledOccurrence } from './types';

const fallbackProfile = fallbackProfileUntyped as (activity: Activity) => ActivityEducationProfile;

function act(overrides: Partial<Activity> & Pick<Activity, 'id' | 'type' | 'title'>): Activity {
  return {
    details: '',
    frequency: { count: 1, period: 'day' },
    durationMinutes: 5,
    priority: 1,
    facilitatorLabel: 'Self',
    locations: ['Home'],
    canBeRemote: true,
    prep: [],
    resources: [],
    backupActivityIds: [],
    skipAdjustment: 'skip',
    metrics: ['adherence'],
    isBackupOnly: false,
    ...overrides,
  };
}

function profile(overrides: Partial<ActivityEducationProfile> & Pick<ActivityEducationProfile, 'activityId'>): ActivityEducationProfile {
  return {
    oneLine: 'A calm, conservative one-line summary the member sees.',
    whatItDoes: 'It is a planned step in the health plan.',
    whyItMatters: 'It may support steady habits the care team can track.',
    healthFocus: ['adherence'],
    expectedSignals: ['adherence'],
    memberGuidance: 'Log completion so the care team can review.',
    careTeamNote: 'Useful for longitudinal review.',
    generatedBy: 'deterministic-fallback',
    generatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

const activities = [
  act({ id: 'a1', type: 'medication', title: 'Morning Med' }),
  act({ id: 'a2', type: 'fitness', title: 'Zone 2 Cardio', metrics: ['session-rpe'] }),
];

describe('validateEducationProfiles', () => {
  it('accepts a complete, sorted, safe set with one profile per activity', () => {
    const profiles = [profile({ activityId: 'a1' }), profile({ activityId: 'a2', expectedSignals: ['session-rpe'] })];
    expect(validateEducationProfiles(profiles, activities)).toEqual([]);
  });

  it('flags a missing activity id', () => {
    const errors = validateEducationProfiles([profile({ activityId: 'a1' })], activities);
    expect(errors.some((e) => e.includes('missing education profile') && e.includes('a2'))).toBe(true);
  });

  it('flags a dangling (unknown) activity id', () => {
    const profiles = [profile({ activityId: 'a1' }), profile({ activityId: 'a2', expectedSignals: ['session-rpe'] }), profile({ activityId: 'ghost' })];
    const errors = validateEducationProfiles(profiles, activities);
    expect(errors.some((e) => e.includes('unknown activityId') && e.includes('ghost'))).toBe(true);
  });

  it('flags a duplicate profile for the same id', () => {
    const profiles = [profile({ activityId: 'a1' }), profile({ activityId: 'a1' }), profile({ activityId: 'a2', expectedSignals: ['session-rpe'] })];
    const errors = validateEducationProfiles(profiles, activities);
    expect(errors.some((e) => e.includes('duplicate profile') && e.includes('a1'))).toBe(true);
  });

  it('flags an overlong oneLine (>120) and overlong arrays (>5)', () => {
    const long = profile({ activityId: 'a1', oneLine: 'x'.repeat(121) });
    const bigArr = profile({ activityId: 'a2', expectedSignals: ['session-rpe'], healthFocus: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const errors = validateEducationProfiles([long, bigArr], activities);
    expect(errors.some((e) => e.includes('oneLine exceeds 120'))).toBe(true);
    expect(errors.some((e) => e.includes('healthFocus exceeds 5'))).toBe(true);
  });

  it('rejects unsafe medical phrasing', () => {
    const unsafe = [
      profile({ activityId: 'a1', whyItMatters: 'This will cure your condition.' }),
      profile({ activityId: 'a2', expectedSignals: ['session-rpe'], memberGuidance: 'Increase the dose if you feel fine.' }),
    ];
    const errors = validateEducationProfiles(unsafe, activities);
    expect(errors.filter((e) => e.includes('unsafe medical phrasing')).length).toBe(2);
  });

  it('flags an unsorted set (not sorted by activityId)', () => {
    const profiles = [profile({ activityId: 'a2', expectedSignals: ['session-rpe'] }), profile({ activityId: 'a1' })];
    const errors = validateEducationProfiles(profiles, activities);
    expect(errors.some((e) => e.includes('not sorted'))).toBe(true);
  });

  it('rejects a malformed (non-profile) entry', () => {
    const errors = validateEducationProfiles([{ activityId: 'a1' }], activities);
    expect(errors.some((e) => e.includes('invalid shape'))).toBe(true);
  });
});

describe('isActivityEducationProfile', () => {
  it('narrows a well-formed profile and rejects junk', () => {
    expect(isActivityEducationProfile(profile({ activityId: 'a1' }))).toBe(true);
    expect(isActivityEducationProfile({ activityId: 'a1' })).toBe(false);
    expect(isActivityEducationProfile(null)).toBe(false);
  });
});

describe('education lookup helpers', () => {
  const map = buildEducationMap([
    profile({ activityId: 'src-1', oneLine: 'source education' }),
    profile({ activityId: 'fallback-1', oneLine: 'fallback education' }),
  ]);

  function occ(overrides: Partial<ScheduledOccurrence>): ScheduledOccurrence {
    return {
      id: 'o1',
      date: '2026-06-01',
      status: 'scheduled',
      sourceActivityId: 'src-1',
      title: 'T',
      type: 'medication',
      details: '',
      facilitatorLabel: 'Self',
      location: 'Home',
      isRemote: true,
      prep: [],
      metrics: [],
      durationMinutes: 5,
      boundResources: [],
      reason: 'r',
      ...overrides,
    };
  }

  it('educationForActivity resolves by id', () => {
    expect(educationForActivity(map, 'src-1')?.oneLine).toBe('source education');
    expect(educationForActivity(map, 'missing')).toBeUndefined();
  });

  it('resolves a scheduled occurrence via sourceActivityId', () => {
    expect(educationForOccurrence(map, occ({ status: 'scheduled' }))?.oneLine).toBe('source education');
  });

  it('resolves a substituted occurrence via effectiveActivityId (the fallback)', () => {
    const o = occ({ status: 'substituted', effectiveActivityId: 'fallback-1', sourceTitle: 'Original' });
    expect(educationForOccurrence(map, o)?.oneLine).toBe('fallback education');
  });

  it('resolves a skipped occurrence via sourceActivityId', () => {
    const o = occ({ status: 'skipped', startTime: undefined, endTime: undefined });
    expect(educationForOccurrence(map, o)?.oneLine).toBe('source education');
  });
});

describe('deterministic fallbackProfile', () => {
  const types: ActivityType[] = ['fitness', 'food', 'medication', 'therapy', 'consultation'];

  it('returns a valid, safe profile for every activity type', () => {
    const acts = types.map((type, i) => act({ id: `t-${i}`, type, title: `${type} action`, metrics: ['adherence', 'side-effects'] }));
    const profiles = acts.map(fallbackProfile).sort((a, b) => (a.activityId < b.activityId ? -1 : 1));
    expect(validateEducationProfiles(profiles, acts)).toEqual([]);
    expect(profiles.every((p) => p.generatedBy === 'deterministic-fallback')).toBe(true);
  });

  it('derives expectedSignals from the activity metrics (never invented)', () => {
    const a = act({ id: 'm1', type: 'fitness', title: 'Run', metrics: ['session-rpe', 'readiness-score'] });
    expect(fallbackProfile(a).expectedSignals).toEqual(['session-rpe', 'readiness-score']);
  });
});
