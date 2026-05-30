/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Inline expansion (no modal) below the MonthGrid row.
 * - Renders ALL occurrences for the day in detail variant.
 * - Skipped occurrences remain DIMMED-BUT-VISIBLE.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render a header showing the date and a close button.
 * 2. Render each occurrence using OccurrenceCard variant='detail'.
 */

import type { ScheduledOccurrence } from '@/lib/types';
import OccurrenceCard from './OccurrenceCard';

export interface DayDetailProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  onClose?: () => void;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
}

export default function DayDetail({ date, occurrences, onClose, onSelect }: DayDetailProps) {
  return (
    <aside className="mt-4 border rounded bg-gray-50 p-4 col-span-7">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{date}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 w-7 h-7 flex items-center justify-center text-sm"
          >
            ✕
          </button>
        )}
      </header>
      {occurrences.length === 0 ? (
        <p className="text-xs text-gray-500">No occurrences for this day.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {occurrences.map((o) => (
            <OccurrenceCard key={o.id} occurrence={o} variant="detail" onSelect={onSelect} />
          ))}
        </div>
      )}
    </aside>
  );
}
