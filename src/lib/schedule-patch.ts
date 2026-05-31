/**
 * DECISION RECAP — 019 Phase 3 Draft input edits
 * - Edits change a scheduler INPUT, never an output (decision 4): a patch is applied to a COPY of
 *   the activities/availability, then scheduleTemporal() reruns and derives the rest. This module is
 *   the pure core — apply + diff — so it is unit-testable without React or the LLM.
 * - Rerun-safe input edits: setTemporalPolicy (activity), addBusyBlock / removeBusyBlock (availability
 *   memberBusy), editTravelWindow (availability travel). setTemporalPolicy patches a COPY of
 *   activity.temporalPolicy (the highest-precedence layer), so it overrides explicit-policy acts.
 * - Diff is by occurrence id. The scheduler keys ids on the stable genDate (NOT the placed day —
 *   temporal-scheduler.ts:615), so the id is itself a stable seed: a busy/travel edit that moves a
 *   placement changes the occurrence's `date`/`startTime`/`status` but NOT its id. So diffResults
 *   matches by id and reports day-moves (date change) and retimes (time change) separately.
 */

import type {
  Activity,
  AvailabilityBundle,
  ScheduleResult,
  TimeBlockPreference,
  ActivityTemporalPolicy,
  LocalTime,
  MemberBusyBlock,
} from './types';
import { getDefaultTemporalPolicy } from './temporal-policy';

export type TimeWindow = 'morning' | 'midday' | 'afternoon' | 'evening';
export type BusyCategory = MemberBusyBlock['category'];

export const ALL_WINDOWS: readonly TimeWindow[] = ['morning', 'midday', 'afternoon', 'evening'];

/** Canonical clock ranges for a named window, so the model only needs to pick a window. */
const WINDOW_TIMES: Record<TimeWindow, { startTime: LocalTime; endTime: LocalTime }> = {
  morning: { startTime: '06:00', endTime: '12:00' },
  midday: { startTime: '11:00', endTime: '14:00' },
  afternoon: { startTime: '12:00', endTime: '17:00' },
  evening: { startTime: '17:00', endTime: '21:00' },
};

const BUSY_CATEGORIES: readonly BusyCategory[] = ['sleep', 'work', 'commute', 'meal', 'family', 'travel', 'personal', 'clinical', 'buffer'];
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A draft schedule edit — the rerun-safe input edits (decision 4). */
export type SchedulePatch =
  | { kind: 'setTemporalPolicy'; activityId: string; window?: TimeWindow; anchor?: ActivityTemporalPolicy['anchor'] }
  | { kind: 'addBusyBlock'; date: string; startTime: string; endTime: string; title: string; category: BusyCategory }
  | { kind: 'removeBusyBlock'; busyBlockId: string; date?: string }
  | { kind: 'editTravelWindow'; travelId: string; startDate: string; endDate: string };

export interface PatchedInputs {
  activities: Activity[];
  availability: AvailabilityBundle;
}

/** Validate a patch against the current inputs; returns an error string or null. */
export function validatePatch(patch: SchedulePatch, activities: Activity[], availability: AvailabilityBundle): string | null {
  switch (patch.kind) {
    case 'setTemporalPolicy':
      if (!activities.some((a) => a.id === patch.activityId)) return `Unknown activity "${patch.activityId}".`;
      if (!patch.window && !patch.anchor) return 'Specify a window (morning/midday/afternoon/evening) or an anchor.';
      return null;
    case 'addBusyBlock':
      if (!DATE_RE.test(patch.date)) return `Invalid date "${patch.date}".`;
      if (!TIME_RE.test(patch.startTime) || !TIME_RE.test(patch.endTime)) return 'Times must be HH:MM.';
      if (patch.startTime >= patch.endTime) return 'startTime must be before endTime.';
      if (!BUSY_CATEGORIES.includes(patch.category)) return `Invalid category "${patch.category}".`;
      return null;
    case 'removeBusyBlock':
      if (!availability.memberBusy.some((mb) => mb.id === patch.busyBlockId)) return `Unknown busy block "${patch.busyBlockId}".`;
      return null;
    case 'editTravelWindow':
      if (!availability.travel.some((t) => t.id === patch.travelId)) return `Unknown travel window "${patch.travelId}".`;
      if (!DATE_RE.test(patch.startDate) || !DATE_RE.test(patch.endDate)) return 'Dates must be YYYY-MM-DD.';
      if (patch.startDate > patch.endDate) return 'startDate must be on or before endDate.';
      return null;
  }
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
    case 'addBusyBlock': {
      const block: MemberBusyBlock = {
        id: `mb-draft-${patch.category}-${patch.date}-${patch.startTime}`,
        title: patch.title,
        category: patch.category,
        blocks: [{ date: patch.date, startTime: patch.startTime as LocalTime, endTime: patch.endTime as LocalTime }],
        blocksScheduling: true,
        visibleByDefault: true,
      };
      return { activities, availability: { ...availability, memberBusy: [...availability.memberBusy, block] } };
    }
    case 'removeBusyBlock': {
      const nextMemberBusy: MemberBusyBlock[] = [];
      for (const mb of availability.memberBusy) {
        if (mb.id !== patch.busyBlockId) {
          nextMemberBusy.push(mb);
          continue;
        }
        if (!patch.date) continue; // no date → remove the whole recurring group
        const blocks = mb.blocks.filter((b) => b.date !== patch.date);
        if (blocks.length > 0) nextMemberBusy.push({ ...mb, blocks });
      }
      return { activities, availability: { ...availability, memberBusy: nextMemberBusy } };
    }
    case 'editTravelWindow': {
      const nextTravel = availability.travel.map((t) =>
        t.id === patch.travelId ? { ...t, blocked: [{ start: patch.startDate, end: patch.endDate }] } : t
      );
      return { activities, availability: { ...availability, travel: nextTravel } };
    }
  }
}

/** A short human description of the patch for the preview card header. */
export function describePatch(patch: SchedulePatch, activities: Activity[], availability: AvailabilityBundle): string {
  switch (patch.kind) {
    case 'setTemporalPolicy': {
      const title = activities.find((a) => a.id === patch.activityId)?.title ?? patch.activityId;
      const where = patch.window ? `the ${patch.window}` : `anchor: ${patch.anchor}`;
      return `Move “${title}” to ${where}`;
    }
    case 'addBusyBlock':
      return `Block ${patch.date} ${patch.startTime}–${patch.endTime} for ${patch.title} (${patch.category})`;
    case 'removeBusyBlock': {
      const title = availability.memberBusy.find((mb) => mb.id === patch.busyBlockId)?.title ?? patch.busyBlockId;
      return patch.date ? `Free up “${title}” on ${patch.date}` : `Remove the “${title}” block (all dates)`;
    }
    case 'editTravelWindow': {
      const dest = availability.travel.find((t) => t.id === patch.travelId)?.destination ?? patch.travelId;
      return `Set ${dest} travel to ${patch.startDate} → ${patch.endDate}`;
    }
  }
}

export interface ScheduleDiff {
  retimed: Array<{ id: string; title: string; date: string; from: string; to: string }>;
  movedDay: Array<{ id: string; title: string; from: string; to: string }>;
  /** newly-skipped occurrences carry the scheduler's deterministic `reason` for the explanation loop. */
  nowSkipped: Array<{ id: string; title: string; date: string; reason: string }>;
  nowScheduled: Array<{ id: string; title: string; date: string }>;
  /** total occurrences that changed in any way */
  totalChanged: number;
}

/** Diff two schedule results by occurrence id (a stable genDate seed; see file recap). */
export function diffResults(before: ScheduleResult, after: ScheduleResult): ScheduleDiff {
  const beforeById = new Map(before.occurrences.map((o) => [o.id, o]));
  const diff: ScheduleDiff = { retimed: [], movedDay: [], nowSkipped: [], nowScheduled: [], totalChanged: 0 };

  for (const a of after.occurrences) {
    const b = beforeById.get(a.id);
    if (!b) continue; // ids are stable for these edits; ignore rare add/remove
    if (b.status !== a.status) {
      if (a.status === 'skipped') diff.nowSkipped.push({ id: a.id, title: a.title, date: a.date, reason: a.reason });
      else if (b.status === 'skipped') diff.nowScheduled.push({ id: a.id, title: a.title, date: a.date });
      diff.totalChanged += 1;
    } else if (a.status !== 'skipped') {
      if (b.date !== a.date) {
        diff.movedDay.push({
          id: a.id,
          title: a.title,
          from: `${b.date} ${b.startTime ?? ''}`.trim(),
          to: `${a.date} ${a.startTime ?? ''}`.trim(),
        });
        diff.totalChanged += 1;
      } else if (b.startTime !== a.startTime) {
        diff.retimed.push({ id: a.id, title: a.title, date: a.date, from: b.startTime ?? '—', to: a.startTime ?? '—' });
        diff.totalChanged += 1;
      }
    }
  }
  return diff;
}
