/**
 * DECISION RECAP — 013 Grounding Payload + System Prompt
 * - Grounding is COMPACT: selected occurrence's trace verbatim + per-month schedule
 *   counts + only the activities the trace references (source + backups). Never the
 *   full 9000-occurrence list or 50 KB diagnostics dump. Keeps each turn cheap and
 *   well under the model context window.
 * - System prompt forces:
 *   (a) 1-3 sentence answers,
 *   (b) explicit occurrenceId + date citations,
 *   (c) UI handoff links in a deterministic markdown format —
 *       [Trace](trace://occ-...), [Calendar](tab://calendar?date=YYYY-MM-DD),
 *       [Resources](tab://resources). The client parses these and turns them into
 *       buttons that call workspace.select(...).
 *   (d) "ask the user to click an occurrence" when selection is empty (rather than
 *       hallucinating a target).
 * - Stateless: the server holds no per-user history; the client carries `messages`
 *   in the request body. `MAX_HISTORY_TURNS` (config.ts) caps the array client-side.
 *
 * PSEUDO-ALGORITHM (buildGrounding):
 *   1. Locate the trace for selection.selectedOccurrenceId (null → trace=null).
 *   2. Compute per-month counts (Jun/Jul/Aug) by iterating result.occurrences.
 *   3. Collect referenced activity ids: trace.sourceActivityId +
 *      trace.attempts[].candidateActivityId.
 *   4. Filter activities[] to those ids; sort by id for determinism.
 *   5. Return GroundingPayload.
 */

import type { Activity, ScheduleResult, ScheduledOccurrence, AllocationTrace, AvailabilityBundle, ActivityEducationProfile } from '@/lib/types';
import type { ResolvedContext } from '@/lib/chat-context';
import type { EducationMap } from '@/lib/activity-education';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 015 — a member occupied block on a specific date, flattened for grounding. */
export interface OccupiedBlock {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
}

export interface GroundingPayload {
  /** Currently selected occurrence id + date (from WorkspaceSelection). */
  selection: { selectedOccurrenceId: string | null; selectedDate: string | null };
  /** Trace for the selected occurrence; null if nothing selected. */
  trace: AllocationTrace | null;
  /** Per-month counts derived from ScheduleResult. */
  scheduleSummary: {
    windowStart: string;
    windowEnd: string;
    totals: { scheduled: number; substituted: number; skipped: number };
    byMonth: Array<{ month: 'Jun' | 'Jul' | 'Aug'; scheduled: number; substituted: number; skipped: number }>;
  };
  /** Only activities referenced by the selected trace (source + backups). */
  activities: Activity[];
  /** 015 — member occupied blocks on the selected date ± 1 day (why a slot was/ wasn't free). */
  occupiedBlocks: OccupiedBlock[];
  /** 016 §11 — customer-facing display bundles on the selected date (e.g. "Morning meds": 4). */
  dayBundles: Array<{ label: string; count: number }>;
  /** 016 §8 — a compact sample of schedule-wide adaptations (substituted/skipped), so global
   * questions ("what changed during travel?", "show substituted items") have data to answer from. */
  adaptations: Array<{ date: string; status: ScheduledOccurrence['status']; title: string; reason: string }>;
  /** 019 Phase 1 — resolved typed contexts attached to this turn (the authoritative context). */
  contexts: ResolvedContext[];
  /** 019 Phase 3 — compact id+title of every activity, so the model can resolve a name the user
   * mentions ("brisk walks") to an activityId for the setTemporalPolicy edit tool. 023 R3 — plus
   * each activity's <=120-char education oneLine, so "what's this for?" answers from committed copy. */
  activityCatalog: Array<{ id: string; title: string; type: ScheduledOccurrence['type']; oneLine?: string }>;
  /** 023 Phase 4 — compact education ONLY for activities relevant this turn (trace source+backups,
   * activities named by contexts, the selected occurrence's source/effective ids). Lets chat answer
   * "what does this do / why is it in my plan?" from committed copy, not invented health claims.
   * Empty when no education map was supplied. */
  education: Array<{
    activityId: string;
    oneLine: string;
    whatItDoes: string;
    whyItMatters: string;
    healthFocus: string[];
    memberGuidance: string;
  }>;
  /** 019 Phase 3 — busy-block + travel catalogs so the model can resolve ids for removeBusyBlock
   * and editTravelWindow. */
  busyBlockCatalog: Array<{ busyBlockId: string; title: string; category: string }>;
  travelCatalog: Array<{ travelId: string; destination: string; startDate: string; endDate: string }>;
}

export const SYSTEM_PROMPT = `You are the Elyx Allocator Assistant. Answer in 1-3 sentences. Cite occurrenceIds (occ-<activityId>-<YYYY-MM-DD>), dates, and times (HH:MM) explicitly. Use only the provided trace, schedule snapshot, occupiedBlocks, dayBundles, and adaptations — never invent facts. SCOPE: the selection is CONTEXT, not necessarily the subject. Answer the user's ACTUAL question — only lean on the selected occurrence's trace when the question is about that occurrence; for schedule-wide questions (travel changes, substituted/skipped items, constrained resources, routines) use scheduleSummary, adaptations, and dayBundles, and do not narrow to the selected occurrence. If the data needed isn't in the snapshot, say so briefly. The trace's chosen attempt carries the final time slot (candidateStartTime/EndTime) and score; failed attempts carry the rejection reasons (kind memberBusy/actionOverlap/temporalRule/outsidePreferredWindow). occupiedBlocks are the member's sleep/work/commute/meal/family blocks near the selected date — use them to explain why a time was blocked or why an action moved. dayBundles are the customer-facing groupings of the selected day's routine low-risk daily food/medication actions (e.g. "Morning meds": 4) — use them to answer routine/grouping questions. If the selection is empty, ask the user to click an occurrence. Treat the contexts array as the authoritative attached context for this turn — the typed schedule objects the user explicitly attached — and prioritise it over the bare selection. To direct the user to the workspace, you MAY call the navigation tools — openTab(tab), selectDate(date), selectOccurrence(occurrenceId), focusResource(resourceKey) — which render as clickable cards. But ALWAYS also write a 1-3 sentence text answer in the SAME turn; NEVER reply with only a tool call. For a "why" / explanation question, the text answer is the point — navigate only in addition to it, never instead of it. The markdown links [Trace](trace://occ-...), [Calendar](tab://calendar?date=YYYY-MM-DD), [Resources](tab://resources) remain a fallback. For schedule edits, call an edit tool — EACH produces a DRAFT the user must Apply; NEVER claim an edit is applied. setTemporalPolicy(activityId, window/anchor) retimes an activity's whole series; addBusyBlock(date, startTime, endTime, title, category) blocks a time range; removeBusyBlock(busyBlockId, date?) frees a member busy block (date for one instance, omit for the whole recurring block); editTravelWindow(travelId, startDate, endDate) changes an EXISTING trip; addTravelWindow(destination, startDate, endDate, timeZone?) schedules a NEW trip to ANY destination — the member is away those days, so the trip days reschedule (remote actions stay, location-bound ones substitute or skip), so supply the destination IANA timeZone when known and use dates inside scheduleSummary.windowStart..windowEnd. Resolve ids from the grounding catalogs (activityCatalog / busyBlockCatalog / travelCatalog) or an attached context. For "what does this action do / why is it in my plan / what's it for" questions, answer from the supplied education entries (whatItDoes/whyItMatters/healthFocus/memberGuidance) and activityCatalog[].oneLine, quoting that copy conservatively; you MUST NOT invent health benefits, outcomes, dosing, or diagnoses beyond the supplied education text.`;

const DAY_MS = 86400000;
function nearbyDates(date: string | null): Set<string> {
  const out = new Set<string>();
  if (!date) return out;
  const base = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  for (let off = -1; off <= 1; off++) {
    const d = new Date(base + off * DAY_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    out.add(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`);
  }
  return out;
}

export function buildGrounding(args: {
  selection: { selectedOccurrenceId: string | null; selectedDate: string | null };
  result: ScheduleResult;
  traces: AllocationTrace[];
  activities: Activity[];
  availability?: AvailabilityBundle;
  contexts?: ResolvedContext[];
  education?: EducationMap;
}): GroundingPayload {
  const { selection, result, traces, activities, availability, contexts, education } = args;

  // 1. Locate trace for the selected occurrence.
  const trace = selection.selectedOccurrenceId
    ? traces.find((t) => t.occurrenceId === selection.selectedOccurrenceId) ?? null
    : null;

  // 2. Compute schedule summary: totals + per-month counts.
  const totals = { scheduled: 0, substituted: 0, skipped: 0 };
  const jun = { scheduled: 0, substituted: 0, skipped: 0 };
  const jul = { scheduled: 0, substituted: 0, skipped: 0 };
  const aug = { scheduled: 0, substituted: 0, skipped: 0 };
  for (const occ of result.occurrences) {
    totals[occ.status] += 1;
    if (occ.date.startsWith('2026-06-')) jun[occ.status] += 1;
    else if (occ.date.startsWith('2026-07-')) jul[occ.status] += 1;
    else if (occ.date.startsWith('2026-08-')) aug[occ.status] += 1;
  }

  // 3. Filter activities to those referenced by the selected trace.
  let referencedActivities: Activity[] = [];
  if (trace) {
    const referencedIds = new Set<string>([trace.sourceActivityId]);
    for (const attempt of trace.attempts) {
      referencedIds.add(attempt.candidateActivityId);
    }
    referencedActivities = activities
      .filter((a) => referencedIds.has(a.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // 023 Phase 4. Collect the activity ids relevant THIS turn for full(ish) education: the trace's
  // source+backups, any activity named by a resolved context (activity ref directly, or the
  // source/effective ids of an occurrence/trace ref), plus the selected occurrence's ids. Then emit
  // a compact education subset (no careTeamNote/expectedSignals/timestamps) sorted by id. [] if no map.
  const eduIds = new Set<string>();
  if (education) {
    for (const a of referencedActivities) eduIds.add(a.id);
    const addOccIds = (occurrenceId: string) => {
      const occ = result.occurrences.find((o) => o.id === occurrenceId);
      if (!occ) return;
      eduIds.add(occ.sourceActivityId);
      if (occ.effectiveActivityId) eduIds.add(occ.effectiveActivityId);
    };
    for (const c of contexts ?? []) {
      if (c.ref.type === 'activity') eduIds.add(c.ref.activityId);
      else if (c.ref.type === 'occurrence' || c.ref.type === 'trace') addOccIds(c.ref.occurrenceId);
    }
    if (selection.selectedOccurrenceId) addOccIds(selection.selectedOccurrenceId);
  }
  const educationPayload: GroundingPayload['education'] = education
    ? [...eduIds]
        .map((id) => education[id])
        .filter((p): p is ActivityEducationProfile => Boolean(p))
        .sort((a, b) => a.activityId.localeCompare(b.activityId))
        .map((p) => ({
          activityId: p.activityId,
          oneLine: p.oneLine,
          whatItDoes: p.whatItDoes,
          whyItMatters: p.whyItMatters,
          healthFocus: p.healthFocus,
          memberGuidance: p.memberGuidance,
        }))
    : [];
  const occupiedBlocks: OccupiedBlock[] = [];
  if (availability && selection.selectedDate) {
    const dates = nearbyDates(selection.selectedDate);
    for (const mb of availability.memberBusy) {
      for (const tb of mb.blocks) {
        if (!dates.has(tb.date)) continue;
        occupiedBlocks.push({
          date: tb.date,
          startTime: tb.startTime,
          endTime: tb.endTime,
          title: mb.title,
          category: mb.category,
        });
      }
    }
    occupiedBlocks.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));
  }

  // 016 §11: the selected day's display bundles (so chat can answer "what's my morning routine").
  const bundleCounts = new Map<string, number>();
  if (selection.selectedDate) {
    for (const occ of result.occurrences) {
      if (occ.date !== selection.selectedDate || !occ.displayBundleLabel) continue;
      bundleCounts.set(occ.displayBundleLabel, (bundleCounts.get(occ.displayBundleLabel) ?? 0) + 1);
    }
  }
  const dayBundles = [...bundleCounts.entries()].map(([label, count]) => ({ label, count }));

  // 016 §8: a small, deterministic sample of schedule-wide adaptations for global questions —
  // prefer travel-window events, then the earliest substituted/skipped, capped at 12.
  // 019: read live availability.travel instead of a hardcoded constant so edits don't desync.
  const travelWindows = (availability?.travel ?? []).flatMap((t) => t.blocked.map((r) => [r.start, r.end] as const));
  const inTravel = (d: string) => travelWindows.some(([s, e]) => d >= s && d <= e);
  const adaptationPool = result.occurrences.filter((o) => o.status !== 'scheduled');
  adaptationPool.sort(
    (a, b) => Number(inTravel(b.date)) - Number(inTravel(a.date)) || a.date.localeCompare(b.date),
  );
  const adaptations = adaptationPool.slice(0, 12).map((o: ScheduledOccurrence) => ({
    date: o.date,
    status: o.status,
    title: o.title,
    reason: o.reason,
  }));

  return {
    selection,
    trace,
    scheduleSummary: {
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      totals,
      byMonth: [
        { month: 'Jun', ...jun },
        { month: 'Jul', ...jul },
        { month: 'Aug', ...aug },
      ],
    },
    activities: referencedActivities,
    occupiedBlocks,
    dayBundles,
    adaptations,
    contexts: contexts ?? [],
    education: educationPayload,
    activityCatalog: activities.map((a) => ({ id: a.id, title: a.title, type: a.type, oneLine: education?.[a.id]?.oneLine })),
    busyBlockCatalog: availability
      ? availability.memberBusy.map((mb) => ({ busyBlockId: mb.id, title: mb.title, category: mb.category }))
      : [],
    travelCatalog: availability
      ? availability.travel.map((t) => ({
          travelId: t.id,
          destination: t.destination,
          startDate: t.blocked[0]?.start ?? '',
          endDate: t.blocked[0]?.end ?? '',
        }))
      : [],
  };
}
