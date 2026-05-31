/**
 * DECISION RECAP — 006 Render Calendar Output + 015 month-overview density
 * - 015: at 116-activity / temporal scale a day has dozens of occurrences. Surface the
 *   ADAPTATION events (skipped / substituted) individually — those are the story — and
 *   COLLAPSE the routine scheduled actions into per-type summary chips ("Meds 7").
 * - Cap visible chip NODES at 8 (the data-testid="day-cell-chips" container). Overflow ->
 *   "+N more" expands the inline DayDetail timeline beneath the grid row.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render the day number.
 * 2. adaptation = skipped + substituted occurrences, SKIPPED FIRST (headline), then by
 *    startTime — rendered as individual chips (the auditable adaptation).
 * 3. scheduled occurrences -> one summary pill per ActivityType ("Meds 7", "Fitness 3").
 * 4. Concatenate [adaptation chips, summary pills]; cap at 8 nodes; trailing "+N more".
 */

import type { ReactNode } from 'react';
import type { ScheduledOccurrence, ActivityType } from '@/lib/types';
import OccurrenceCard from './OccurrenceCard';

export interface DayCellProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  expanded?: boolean;
  onExpand?: (date: string) => void;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
}

const TYPE_SUMMARY: Record<ActivityType, { label: string; cls: string }> = {
  fitness: { label: 'Fitness', cls: 'bg-indigo-100 text-indigo-800' },
  food: { label: 'Food', cls: 'bg-lime-100 text-lime-800' },
  medication: { label: 'Meds', cls: 'bg-rose-100 text-rose-800' },
  therapy: { label: 'Therapy', cls: 'bg-violet-100 text-violet-800' },
  consultation: { label: 'Consult', cls: 'bg-sky-100 text-sky-800' },
};

const TYPE_ORDER: ActivityType[] = ['consultation', 'fitness', 'therapy', 'food', 'medication'];
const MAX_NODES = 8;

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export default function DayCell({ date, occurrences, expanded, onExpand, onSelect }: DayCellProps) {
  // Skipped first (the headline — and skipped have no startTime), then substituted by time.
  const STATUS_RANK: Record<string, number> = { skipped: 0, substituted: 1 };
  const adaptation = occurrences
    .filter((o) => o.status !== 'scheduled')
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'),
    );
  const scheduled = occurrences.filter((o) => o.status === 'scheduled');

  const counts = new Map<ActivityType, number>();
  for (const o of scheduled) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  const summary = TYPE_ORDER.filter((t) => counts.has(t)).map((t) => ({ type: t, n: counts.get(t)! }));

  const totalNodes = adaptation.length + summary.length;
  const overflow = totalNodes > MAX_NODES;
  const budget = overflow ? MAX_NODES - 1 : MAX_NODES;

  const nodes: ReactNode[] = [];
  for (const o of adaptation) {
    if (nodes.length >= budget) break;
    nodes.push(<OccurrenceCard key={o.id} occurrence={o} variant="chip" onSelect={onSelect} />);
  }
  for (const s of summary) {
    if (nodes.length >= budget) break;
    const meta = TYPE_SUMMARY[s.type];
    nodes.push(
      <button
        key={`sum-${s.type}`}
        type="button"
        onClick={() => onExpand?.(date)}
        className={`self-start rounded px-1.5 py-0.5 text-[10px] ${meta.cls} hover:brightness-95`}
      >
        {meta.label} {s.n}
      </button>,
    );
  }

  const hidden = totalNodes - nodes.length;

  return (
    <div className={`bg-white p-2 min-h-24 flex flex-col gap-1 ${expanded ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="text-xs font-semibold text-gray-700">{parseYMD(date).d}</div>
      <div data-testid="day-cell-chips" className="flex flex-col gap-1">
        {nodes}
        {(overflow || (expanded && occurrences.length > 0)) && onExpand && (
          <button
            type="button"
            onClick={() => onExpand(date)}
            className="self-start text-[10px] text-blue-600 hover:underline"
          >
            {expanded ? 'hide' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}
