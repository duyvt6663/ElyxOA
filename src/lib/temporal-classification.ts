/**
 * DECISION RECAP — 026 Shared blocking/overlap classification
 * - Single source of truth for the 015 "blocking vs quick" rule, so the scheduler (placement) and the
 *   Trace-tab overlap explanation (UI) can never drift. Extracted from temporal-scheduler.ts.
 * - Pure, side-effect-free. `temporal-scheduler.ts` imports `isBlockingActivity`;
 *   `AllocationTraceTab.tsx` imports `overlapExplanationKind`.
 *
 * "Blocking" actions occupy exclusive focused member time (strength/VO2 workouts, therapy sessions,
 * consultations, meal prep) — no two may overlap and they cannot overlap blocking busy blocks.
 * "Quick" actions are point-in-time: they get a placed time and still obey waking hours + their own
 * temporal (safety/proximity) rules, but may coincide with each other and with blocking actions.
 * Quick = (<20 min: pills, BP/CGM logs, hydration, short food habits) OR low-intensity fitness
 * (brisk walks, mobility, balance, step-count). This realizes 015's "daily overload is a soft score".
 */

import type { Activity, ActivityTemporalPolicy, ScheduledOccurrence } from './types';

/** 015 — true when the action needs exclusive focused time; false for point-in-time "quick" actions. */
export function isBlockingActivity(activity: Activity, policy: ActivityTemporalPolicy): boolean {
  if (activity.type === 'fitness' && policy.intensity === 'low') return false;
  return activity.durationMinutes >= 20;
}

/** 026 — which overlap explanation (if any) the Trace tab should show. null = no note. */
export type OverlapExplanationKind = 'consultation' | 'quick';

/**
 * Classify the overlap explanation for a PLACED occurrence by its EFFECTIVE action (the fallback for a
 * substitution, the source otherwise). Returns null for skipped occurrences (nothing placed) and for
 * blocking, non-consultation actions (they take exclusive time and never overlap a blocking block).
 */
export function overlapExplanationKind(
  occ: Pick<ScheduledOccurrence, 'status' | 'effectiveActivityId' | 'sourceActivityId'>,
  activityById: ReadonlyMap<string, Activity>,
  policyFor: (activity: Activity) => ActivityTemporalPolicy,
): OverlapExplanationKind | null {
  if (occ.status === 'skipped') return null;
  const activity = activityById.get(occ.effectiveActivityId ?? occ.sourceActivityId);
  if (!activity) return null;
  if (activity.type === 'consultation') return 'consultation';
  return isBlockingActivity(activity, policyFor(activity)) ? null : 'quick';
}
