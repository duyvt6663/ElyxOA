/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Shows the locked window range (2026-06-01 .. 2026-08-31).
 * - 3 colored count badges: scheduled / substituted / skipped (skipped DIMMED-BUT-VISIBLE).
 * - Reads counts directly from ScheduleResult (UI does not recompute).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render window range label.
 * 2. Render 3 badges with status colors and counts derived from result.scheduled.
 */

import type { ScheduleResult, ScheduledOccurrence, ActivityType } from '@/lib/types';

const STATUS_STYLES: Record<ScheduledOccurrence['status'], { badge: string; row: string }> = {
  scheduled:   { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', row: 'border-emerald-200' },
  substituted: { badge: 'bg-amber-100 text-amber-800 border-amber-200',       row: 'border-amber-200' },
  skipped:     { badge: 'bg-gray-100 text-gray-700 border-gray-200',          row: 'border-gray-200 opacity-60' },
};

const TYPE_STYLES: Record<ActivityType, string> = {
  fitness:      'bg-indigo-100 text-indigo-800',
  food:         'bg-lime-100 text-lime-800',
  medication:   'bg-rose-100 text-rose-800',
  therapy:      'bg-violet-100 text-violet-800',
  consultation: 'bg-sky-100 text-sky-800',
};

export interface SummaryHeaderProps {
  result: ScheduleResult;
}

export default function SummaryHeader({ result }: SummaryHeaderProps) {
  const nScheduled = result.occurrences.filter((o) => o.status === 'scheduled').length;
  const nSubstituted = result.occurrences.filter((o) => o.status === 'substituted').length;
  const nSkipped = result.occurrences.filter((o) => o.status === 'skipped').length;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b pb-3">
      <div className="text-sm font-medium">
        Window: {result.windowStart} → {result.windowEnd}
      </div>
      <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLES.scheduled.badge}`}>
        Scheduled · {nScheduled}
      </span>
      <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLES.substituted.badge}`}>
        Substituted · {nSubstituted}
      </span>
      <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLES.skipped.badge}`}>
        Skipped · {nSkipped}
      </span>
    </header>
  );
}
