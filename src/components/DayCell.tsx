/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Cap at ~3 OccurrenceCard chips per cell.
 * - Overflow shows "+N more" affordance that triggers onExpand (inline DayDetail).
 * - No modal — expansion is inline beneath the grid row.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render the day number from the ISO date.
 * 2. Render up to 3 OccurrenceCard chips in chip variant.
 * 3. If occurrences.length > 3, render a "+N more" button calling onExpand(date).
 * 4. When `expanded` is true, parent renders DayDetail; this cell shows a subtle highlight.
 */

import type { ScheduledOccurrence } from '@/lib/types';
import OccurrenceCard from './OccurrenceCard';

export interface DayCellProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  expanded?: boolean;
  onExpand?: (date: string) => void;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
}

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export default function DayCell({
  date,
  occurrences,
  expanded,
  onExpand,
  onSelect,
}: DayCellProps) {
  const overflow = occurrences.length - 3;

  return (
    <div
      className={`bg-white p-2 min-h-24 flex flex-col gap-1 ${
        expanded ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <div className="text-xs font-semibold text-gray-700">{parseYMD(date).d}</div>
      {occurrences.slice(0, 3).map((o) => (
        <OccurrenceCard key={o.id} occurrence={o} variant="chip" onSelect={onSelect} />
      ))}
      {overflow > 0 && onExpand && (
        <button
          type="button"
          onClick={() => onExpand(date)}
          className="self-start text-[10px] text-blue-600 hover:underline"
        >
          {expanded ? 'hide' : `+${overflow} more`}
        </button>
      )}
    </div>
  );
}
