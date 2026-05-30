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

import type { Activity, ScheduleResult, AllocationTrace } from '@/lib/types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
}

export const SYSTEM_PROMPT = `You are the Elyx Allocator Assistant. Answer in 1-3 sentences. Cite occurrenceIds (occ-<activityId>-<YYYY-MM-DD>) and dates explicitly. Use only the provided trace and schedule snapshot — never invent facts. If the selection is empty, ask the user to click an occurrence. When directing the user to the workspace, format links as [Trace](trace://occ-...), [Calendar](tab://calendar?date=YYYY-MM-DD), or [Resources](tab://resources).`;

export function buildGrounding(args: {
  selection: { selectedOccurrenceId: string | null; selectedDate: string | null };
  result: ScheduleResult;
  traces: AllocationTrace[];
  activities: Activity[];
}): GroundingPayload {
  const { selection, result, traces, activities } = args;

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
  };
}
