'use client';

/**
 * DECISION RECAP — 006 Render Calendar Output + 015 day timeline
 * - 015: the inline day detail is now a chronological DayTimeline (actions interleaved with
 *   occupied member time) plus a "Show occupied slots" toggle. Skipped occurrences are
 *   listed dimmed below the lane by DayTimeline.
 * - Still inline (no modal), still col-span-7 beneath the grid row.
 */

import { useState } from 'react';
import type { ScheduledOccurrence, MemberBusyBlock } from '@/lib/types';
import type { EducationMap } from '@/lib/activity-education';
import DayTimeline from './DayTimeline';

export interface DayDetailProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  memberBusy?: MemberBusyBlock[];
  onClose?: () => void;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
  /** 023 follow-up — selection + education + opt-in trace nav, for the inline action detail card. */
  selectedOccurrenceId?: string | null;
  education?: EducationMap;
  onViewTrace?: (occurrence: ScheduledOccurrence) => void;
}

export default function DayDetail({ date, occurrences, memberBusy = [], onClose, onSelect, selectedOccurrenceId = null, education, onViewTrace }: DayDetailProps) {
  const [showOccupied, setShowOccupied] = useState(true);

  return (
    <aside className="mt-4 border rounded bg-gray-50 p-4 col-span-7">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{date}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOccupied}
              onChange={(e) => setShowOccupied(e.target.checked)}
            />
            Show occupied slots
          </label>
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
        </div>
      </header>
      {occurrences.length === 0 ? (
        <p className="text-xs text-gray-500">No occurrences for this day.</p>
      ) : (
        <DayTimeline
          date={date}
          occurrences={occurrences}
          memberBusy={memberBusy}
          showOccupied={showOccupied}
          onSelect={onSelect}
          selectedOccurrenceId={selectedOccurrenceId}
          education={education}
          onViewTrace={onViewTrace}
        />
      )}
    </aside>
  );
}
