/**
 * DECISION RECAP — 019 Phase 3 Draft input edits
 * - Edits change a scheduler INPUT, never an output (decision 4): a patch is applied to a COPY of
 *   the activities/availability, then scheduleTemporal() reruns and derives the rest. This module is
 *   the pure core — apply + diff — so it is unit-testable without React or the LLM.
 * - First patch: setTemporalPolicy. It patches a copy of `activity.temporalPolicy` (the highest-
 *   precedence layer — buildPolicyResolver checks activity.temporalPolicy before hints), so it
 *   overrides even explicit-policy activities. No scheduler change needed.
 * - Diff is by occurrence id (occ-<activityId>-<date>): setTemporalPolicy keeps dates, so ids are
 *   stable and a retime shows as a startTime change on the same id.
 */

import type {
  Activity,
  AvailabilityBundle,
  ScheduleResult,
  TimeBlockPreference,
  ActivityTemporalPolicy,
  LocalTime,
} from './types';
import { getDefaultTemporalPolicy } from './temporal-policy';

export type TimeWindow = 'morning' | 'midday' | 'afternoon' | 'evening';

/** Canonical clock ranges for a named window, so the model only needs to pick a window. */
const WINDOW_TIMES: Record<TimeWindow, { startTime: LocalTime; endTime: LocalTime }> = {
  morning: { startTime: '06:00', endTime: '12:00' },
  midday: { startTime: '11:00', endTime: '14:00' },
  afternoon: { startTime: '12:00', endTime: '17:00' },
  evening: { startTime: '17:00', endTime: '21:00' },
};

/** A draft schedule edit. Phase 3 ships the rerun-safe input edits; setTemporalPolicy is first. */
export type SchedulePatch = {
  kind: 'setTemporalPolicy';
  activityId: string;
  window?: TimeWindow;
  anchor?: ActivityTemporalPolicy['anchor'];
};

export interface PatchedInputs {
  activities: Activity[];
  availability: AvailabilityBundle;
}

/** Validate a patch against the current inputs; returns an error string or null. */
export function validatePatch(patch: SchedulePatch, activities: Activity[]): string | null {
  if (patch.kind === 'setTemporalPolicy') {
    if (!activities.some((a) => a.id === patch.activityId)) {
      return `Unknown activity "${patch.activityId}".`;
    }
    if (!patch.window && !patch.anchor) {
      return 'Specify a window (morning/midday/afternoon/evening) or an anchor.';
    }
  }
  return null;
}

/** Apply a patch to a COPY of the inputs (decision 4). Caller reruns scheduleTemporal on the result. */
export function applyPatchToInputs(
  patch: SchedulePatch,
  activities: Activity[],
  availability: AvailabilityBundle
): PatchedInputs {
  switch (patch.kind) {
    case 'setTemporalPolicy': {
      const nextActivities = activities.map((a) => {
        if (a.id !== patch.activityId) return a;
        const base = a.temporalPolicy ?? getDefaultTemporalPolicy(a);
        const preferredWindows: TimeBlockPreference[] = patch.window
          ? [{ label: patch.window, ...WINDOW_TIMES[patch.window] }]
          : base.preferredWindows;
        const temporalPolicy: ActivityTemporalPolicy = {
          ...base,
          preferredWindows,
          ...(patch.anchor ? { anchor: patch.anchor } : {}),
        };
        return { ...a, temporalPolicy };
      });
      return { activities: nextActivities, availability };
    }
  }
}

/** A short human description of the patch for the preview card header. */
export function describePatch(patch: SchedulePatch, activities: Activity[]): string {
  if (patch.kind === 'setTemporalPolicy') {
    const title = activities.find((a) => a.id === patch.activityId)?.title ?? patch.activityId;
    const where = patch.window ? `the ${patch.window}` : `anchor: ${patch.anchor}`;
    return `Move “${title}” to ${where}`;
  }
  return 'Edit';
}

export interface ScheduleDiff {
  retimed: Array<{ id: string; title: string; date: string; from: string; to: string }>;
  nowSkipped: Array<{ id: string; title: string; date: string }>;
  nowScheduled: Array<{ id: string; title: string; date: string }>;
  /** total occurrences that changed in any way */
  totalChanged: number;
}

/** Diff two schedule results by occurrence id (stable across a setTemporalPolicy retime). */
export function diffResults(before: ScheduleResult, after: ScheduleResult): ScheduleDiff {
  const beforeById = new Map(before.occurrences.map((o) => [o.id, o]));
  const diff: ScheduleDiff = { retimed: [], nowSkipped: [], nowScheduled: [], totalChanged: 0 };

  for (const a of after.occurrences) {
    const b = beforeById.get(a.id);
    if (!b) continue; // ids are stable for setTemporalPolicy; ignore rare add/remove here
    if (b.status !== a.status) {
      if (a.status === 'skipped') diff.nowSkipped.push({ id: a.id, title: a.title, date: a.date });
      else if (b.status === 'skipped') diff.nowScheduled.push({ id: a.id, title: a.title, date: a.date });
      diff.totalChanged += 1;
    } else if (a.status !== 'skipped' && b.startTime !== a.startTime) {
      diff.retimed.push({
        id: a.id,
        title: a.title,
        date: a.date,
        from: b.startTime ?? '—',
        to: a.startTime ?? '—',
      });
      diff.totalChanged += 1;
    }
  }
  return diff;
}
