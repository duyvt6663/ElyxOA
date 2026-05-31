/**
 * DECISION RECAP — 019 Phase 1 Contextual Chat (frozen contract)
 * - This module is the SHARED interface between the chat UI (ContextTray / AtMentionMenu /
 *   ChatSurface) and the grounding/api spine (prompt.ts / api/chat). Both sides compile against
 *   the types here; implementations live on each side.
 * - ContextRef is TYPED (019 decision 2): chat never receives bare labels, it receives typed refs.
 *   A `busyBlock` ref carries instance fields (date/start/end) because a MemberBusyBlock id is
 *   recurring across the window (019 finding #4).
 * - Resolution is LAYERED (019 finding #3), not split by location:
 *     buildContextIndex(...) → a small client-side index that powers @-autocomplete and
 *       deterministic navigation WITHOUT an API key. Built once at server render (page.tsx, which
 *       already holds availability) and threaded down as a prop, so the client never ships the full
 *       availability fixture.
 *     resolveContextRefs(...) → compact per-ref summaries for the LLM grounding, built server-side
 *       in /api/chat where the canonical availability lives.
 * - The /api/chat request body gains `contexts: ChatContextItem[]` (019 Phase 1).
 */

/**
 * BEHAVIOR SKETCH
 * 1. buildContextIndex(result, availability) → ContextIndex (travel windows, busy-block catalog,
 *    resource roles, bundle labels). Occurrences/activities are resolvable from `result` directly,
 *    so they are NOT duplicated into the index.
 * 2. resolveContextRefs(refs, result, traces, activities, availability) → ResolvedContext[]: one
 *    compact summary per ref; mark `unresolved: true` (never invent) when an id does not resolve.
 */

import type { ScheduleResult, AvailabilityBundle, AllocationTrace, Activity, DateRange } from './types';

/** Where a context block came from (019 grounding model). */
export type ContextProvenance = 'selected' | 'pinned' | 'atMention' | 'assistantAction' | 'draftPatch';

/** A typed reference to a workspace object, attached to a chat turn (019 decision 2). */
export type ContextRef =
  | { type: 'day'; date: string }
  | { type: 'timeBlock'; date: string; startTime: string; endTime: string; source: 'calendar' | 'busy' | 'draft' }
  | { type: 'occurrence'; occurrenceId: string }
  | { type: 'activity'; activityId: string }
  | { type: 'bundle'; date: string; label: string }
  // A MemberBusyBlock id is recurring; a clicked block is ONE instance, so carry the instance fields.
  | { type: 'busyBlock'; busyBlockId: string; date: string; startTime: string; endTime: string; title: string; category: string }
  | { type: 'resource'; kind: string; role: string }
  | { type: 'travelWindow'; travelId: string }
  | { type: 'trace'; occurrenceId: string }
  | { type: 'scheduleRange'; startDate: string; endDate: string };

/** A context block as held in workspace state and rendered as a removable chip in the tray. */
export interface ContextBlock {
  /** Stable key for React + remove/dedupe (e.g. `${ref.type}:${canonical id/date}`). */
  key: string;
  ref: ContextRef;
  provenance: ContextProvenance;
  /** Pinned blocks survive selection/tab/date changes; active (selected) blocks update with selection. */
  pinned: boolean;
  /** Short human label for the chip, e.g. "Day Jun 22" or "Action Remote Brisk Walk". */
  label: string;
}

/** The wire item carried in the /api/chat request body for each attached context. */
export interface ChatContextItem {
  ref: ContextRef;
  provenance: ContextProvenance;
}

/**
 * Lightweight client index: enough to power @-autocomplete + deterministic navigation WITHOUT a key.
 * A few KB; built at server render and threaded as a prop. Occurrences/activities resolve from the
 * ScheduleResult the client already holds, so they are intentionally absent here.
 */
export interface ContextIndex {
  travel: Array<{ travelId: string; destination: string; startDate: string; endDate: string }>;
  busyBlocks: Array<{ busyBlockId: string; title: string; category: string }>;
  resources: Array<{ kind: string; role: string; label: string }>;
  bundleLabels: string[];
}

/** A suggestion surfaced by the @-mention menu. */
export interface AtMentionSuggestion {
  /** Token inserted into the composer, e.g. "@SingaporeTrip". */
  token: string;
  /** Display label, e.g. "Singapore trip · Jun 22–29". */
  label: string;
  /** Canonical typed ref carried in the request (NOT just text). */
  ref: ContextRef;
  kind: ContextRef['type'];
}

/** A resolved, compact summary of one ref for the LLM grounding (server side). */
export interface ResolvedContext {
  ref: ContextRef;
  provenance: ContextProvenance;
  /** One-line, capped summary. Never the full 3-month list. */
  summary: string;
  /** True when the ref id could not be resolved — surfaced to the UI, never sent as fact. */
  unresolved?: boolean;
}

/** Compact a DateRange[] into "start..end" segments for a summary line. */
function fmtRanges(ranges: DateRange[]): string {
  return ranges.map((r) => `${r.start}..${r.end}`).join(', ');
}

/** Invert `available` windows into the unavailable (outage) ranges within the scheduling window. */
function outageRanges(available: DateRange[], windowStart: string, windowEnd: string): DateRange[] {
  const sorted = [...available].sort((a, b) => a.start.localeCompare(b.start));
  const out: DateRange[] = [];
  let cursor = windowStart;
  for (const r of sorted) {
    if (r.start > cursor) out.push({ start: cursor, end: prevDate(r.start) });
    if (r.end >= cursor) cursor = nextDate(r.end);
  }
  if (cursor <= windowEnd) out.push({ start: cursor, end: windowEnd });
  return out;
}

const ONE_DAY_MS = 86400000;
function shiftDate(date: string, days: number): string {
  const base = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const d = new Date(base + days * ONE_DAY_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const prevDate = (date: string) => shiftDate(date, -1);
const nextDate = (date: string) => shiftDate(date, 1);

/**
 * Build the client context index from the schedule + canonical availability. Called once at server
 * render (page.tsx). Flattens travel windows, busy-block catalog, resource roles, and bundle labels;
 * occurrences/activities resolve from `result` directly so they are not duplicated here.
 */
export function buildContextIndex({ result, availability }: { result: ScheduleResult; availability: AvailabilityBundle }): ContextIndex {
  const travel = availability.travel.map((t) => ({
    travelId: t.id,
    destination: t.destination,
    startDate: t.blocked[0]?.start ?? '',
    endDate: t.blocked[0]?.end ?? '',
  }));

  const busyBlocks = availability.memberBusy.map((mb) => ({
    busyBlockId: mb.id,
    title: mb.title,
    category: mb.category,
  }));

  const resources: ContextIndex['resources'] = [
    ...availability.equipment.map((e) => ({ kind: 'equipment', role: e.role, label: e.label })),
    ...availability.specialists.map((s) => ({ kind: 'specialist', role: s.role, label: s.name })),
    ...availability.alliedHealth.map((a) => ({ kind: 'alliedHealth', role: a.role, label: a.discipline })),
  ];

  const bundleLabels = [...new Set(
    result.occurrences.map((o) => o.displayBundleLabel).filter((l): l is string => Boolean(l)),
  )];

  return { travel, busyBlocks, resources, bundleLabels };
}

/** HH:MM from an occurrence's optional start/end times. */
function fmtTime(start?: string, end?: string): string {
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  return 'unscheduled';
}

/**
 * Resolve ContextRef[] into compact grounding summaries (server side, in /api/chat). One capped,
 * one-line summary per ref; unresolvable ids set `unresolved: true` (never invented).
 */
export function resolveContextRefs({ refs, result, traces, activities, availability }: {
  refs: ChatContextItem[];
  result: ScheduleResult;
  traces: AllocationTrace[];
  activities: Activity[];
  availability: AvailabilityBundle;
}): ResolvedContext[] {
  return refs.map((item) => resolveOne(item, result, traces, activities, availability));
}

function resolveOne(
  item: ChatContextItem,
  result: ScheduleResult,
  traces: AllocationTrace[],
  activities: Activity[],
  availability: AvailabilityBundle,
): ResolvedContext {
  const { ref, provenance } = item;
  const base = { ref, provenance };

  switch (ref.type) {
    case 'occurrence': {
      const occ = result.occurrences.find((o) => o.id === ref.occurrenceId);
      if (!occ) return { ...base, summary: `Occurrence ${ref.occurrenceId} not found.`, unresolved: true };
      return { ...base, summary: `Occurrence ${occ.id}: "${occ.title}" (${occ.type}) on ${occ.date} ${fmtTime(occ.startTime, occ.endTime)}, ${occ.status}.` };
    }

    case 'trace': {
      const trace = traces.find((t) => t.occurrenceId === ref.occurrenceId);
      if (!trace) return { ...base, summary: `Trace for ${ref.occurrenceId} not found.`, unresolved: true };
      const chosen = trace.chosenIndex != null ? trace.attempts[trace.chosenIndex] : undefined;
      const occ = result.occurrences.find((o) => o.id === ref.occurrenceId);
      const scorePart = chosen?.score != null ? ` chosen score ${chosen.score}` : '';
      return { ...base, summary: `Trace ${trace.occurrenceId}: ${trace.status}, ${trace.attempts.length} attempt(s),${scorePart}; reason: ${occ?.reason ?? 'n/a'}.` };
    }

    case 'activity': {
      const act = activities.find((a) => a.id === ref.activityId);
      if (!act) return { ...base, summary: `Activity ${ref.activityId} not found.`, unresolved: true };
      return { ...base, summary: `Activity ${act.id}: "${act.title}" (${act.type}), priority ${act.priority}, frequency ${act.frequency.count}/${act.frequency.period}.` };
    }

    case 'day': {
      const onDay = result.occurrences.filter((o) => o.date === ref.date);
      const counts = { scheduled: 0, substituted: 0, skipped: 0 };
      for (const o of onDay) counts[o.status] += 1;
      const reasons = onDay
        .filter((o) => o.status !== 'scheduled')
        .slice(0, 4)
        .map((o) => `${o.title} (${o.status}: ${o.reason})`)
        .join('; ');
      const why = reasons ? ` Missing/adapted: ${reasons}.` : '';
      return { ...base, summary: `Day ${ref.date}: ${counts.scheduled} scheduled, ${counts.substituted} substituted, ${counts.skipped} skipped.${why}` };
    }

    case 'busyBlock': {
      return { ...base, summary: `Busy block "${ref.title}" (${ref.category}) on ${ref.date} ${ref.startTime}-${ref.endTime}.` };
    }

    case 'resource': {
      let windows: DateRange[] | null = null;
      let label = '';
      const eq = availability.equipment.find((e) => e.role === ref.role);
      if (eq) { windows = eq.blocked; label = eq.label; }
      const sp = availability.specialists.find((s) => s.role === ref.role);
      if (!eq && sp) { windows = outageRanges(sp.available, availability.windowStart, availability.windowEnd); label = sp.name; }
      const ah = availability.alliedHealth.find((a) => a.role === ref.role);
      if (!eq && !sp && ah) { windows = outageRanges(ah.available, availability.windowStart, availability.windowEnd); label = ah.discipline; }
      if (windows === null) return { ...base, summary: `Resource ${ref.kind}/${ref.role} not found.`, unresolved: true };
      const outage = windows.length ? `unavailable ${fmtRanges(windows)}` : 'no outages';
      return { ...base, summary: `Resource ${ref.kind}/${ref.role} ("${label}"): ${outage}.` };
    }

    case 'travelWindow': {
      const trip = availability.travel.find((t) => t.id === ref.travelId);
      if (!trip) return { ...base, summary: `Travel window ${ref.travelId} not found.`, unresolved: true };
      const range = trip.blocked[0];
      const affected = range
        ? result.occurrences.filter((o) => o.date >= range.start && o.date <= range.end).length
        : 0;
      return { ...base, summary: `Travel "${trip.destination}" ${range ? `${range.start}..${range.end}` : '(no dates)'}: ${affected} occurrence(s) in range.` };
    }

    case 'bundle': {
      const count = result.occurrences.filter((o) => o.date === ref.date && o.displayBundleLabel === ref.label).length;
      if (count === 0) return { ...base, summary: `Bundle "${ref.label}" on ${ref.date} not found.`, unresolved: true };
      return { ...base, summary: `Bundle "${ref.label}" on ${ref.date}: ${count} occurrence(s).` };
    }

    case 'timeBlock': {
      const overlaps = availability.memberBusy.some((mb) =>
        mb.blocks.some((b) => b.date === ref.date && b.startTime < ref.endTime && b.endTime > ref.startTime),
      );
      return { ...base, summary: `Time block ${ref.date} ${ref.startTime}-${ref.endTime} (${ref.source}): ${overlaps ? 'overlaps a busy block' : 'no busy-block overlap'}.` };
    }

    case 'scheduleRange': {
      const counts = new Map<string, number>();
      for (const o of result.occurrences) {
        if (o.date < ref.startDate || o.date > ref.endDate) continue;
        const month = o.date.slice(0, 7);
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      const buckets = [...counts.entries()].sort().map(([m, c]) => `${m}: ${c}`).join(', ');
      return { ...base, summary: `Range ${ref.startDate}..${ref.endDate}: ${buckets || 'no occurrences'}.` };
    }
  }
}
