/**
 * DECISION RECAP — 023 activity education lookup
 * - The committed education profiles (src/data/activity-education.json) are keyed by activityId.
 *   This module turns them into a map and resolves the profile for the activity that was actually
 *   SCHEDULED on an occurrence — the fallback (effectiveActivityId) for a substitution, else the
 *   source activity. The original-plan profile is looked up separately via sourceActivityId.
 * - UI falls back to Activity.details when a profile is missing (the generator covers all ids, but
 *   an imported activity set may not).
 */

import type { ActivityEducationProfile, ScheduledOccurrence } from './types';

export type EducationMap = Record<string, ActivityEducationProfile>;

export function buildEducationMap(profiles: ActivityEducationProfile[]): EducationMap {
  const map: EducationMap = {};
  for (const p of profiles) map[p.activityId] = p;
  return map;
}

/** Education for the activity actually SCHEDULED on this occurrence (effective = fallback or source). */
export function educationForOccurrence(
  map: EducationMap,
  occ: ScheduledOccurrence
): ActivityEducationProfile | undefined {
  return map[occ.effectiveActivityId ?? occ.sourceActivityId];
}

export function educationForActivity(map: EducationMap, activityId: string): ActivityEducationProfile | undefined {
  return map[activityId];
}
