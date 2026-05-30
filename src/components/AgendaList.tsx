/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Mobile fallback for MonthGrid: vertical list grouped by week then day.
 * - Same OccurrenceCard component reused in detail variant for readability on small screens.
 * - Skipped occurrences remain DIMMED-BUT-VISIBLE.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Group occurrences by ISO week (Mon-start) -> then by day.
 * 2. For each week, render a header (e.g. "Week of Jun 1").
 * 3. For each day in the week with occurrences, render a day header + OccurrenceCards.
 * 4. (010 #6) When `month` is provided, filter occurrences to that month's date prefix
 *    BEFORE grouping, so the mobile list stays consistent with the MonthGrid switcher.
 * 5. (010 #8) When the filtered list is empty, render a dashed empty-state notice.
 */

import type { ScheduledOccurrence } from '@/lib/types';
import OccurrenceCard from './OccurrenceCard';

export interface AgendaListProps {
  occurrences: ScheduledOccurrence[];
  onSelect?: (occurrence: ScheduledOccurrence) => void;
  /** (010 #6) Optional month filter; when set, only occurrences in that month show. */
  month?: 'Jun' | 'Jul' | 'Aug';
}

const MONTH_PREFIX: Record<'Jun' | 'Jul' | 'Aug', string> = {
  Jun: '2026-06-',
  Jul: '2026-07-',
  Aug: '2026-08-',
};

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}
function formatYMD(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}
function weekdayOfYMD(s: string): number {
  const { y, m, d } = parseYMD(s);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
function mondayOfWeek(s: string): string {
  const { y, m, d } = parseYMD(s);
  const wd = weekdayOfYMD(s);
  const ts = Date.UTC(y, m - 1, d) - (wd - 1) * 86400000;
  const dt = new Date(ts);
  return formatYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export default function AgendaList({ occurrences, onSelect, month }: AgendaListProps) {
  const filtered = month
    ? occurrences.filter((o) => o.date.startsWith(MONTH_PREFIX[month]))
    : occurrences;

  if (filtered.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 text-center">
        No occurrences match current filters.
      </div>
    );
  }

  const byWeek = new Map<string, Map<string, ScheduledOccurrence[]>>();
  for (const o of filtered) {
    const wk = mondayOfWeek(o.date);
    let days = byWeek.get(wk);
    if (!days) {
      days = new Map<string, ScheduledOccurrence[]>();
      byWeek.set(wk, days);
    }
    const arr = days.get(o.date) ?? [];
    arr.push(o);
    days.set(o.date, arr);
  }

  const sortedWeeks = [...byWeek.keys()].sort();

  return (
    <section className="flex flex-col gap-4">
      {sortedWeeks.map((weekStart) => {
        const days = byWeek.get(weekStart)!;
        const sortedDates = [...days.keys()].sort();
        return (
          <article key={weekStart}>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">
              Week of {weekStart}
            </h3>
            {sortedDates.map((date) => (
              <div key={date} className="border-l-2 border-gray-200 pl-3 mb-3">
                <div className="text-xs font-medium text-gray-700 mb-1">{date}</div>
                <div className="flex flex-col gap-3">
                  {days.get(date)!.map((o) => (
                    <OccurrenceCard key={o.id} occurrence={o} variant="detail" onSelect={onSelect} />
                  ))}
                </div>
              </div>
            ))}
          </article>
        );
      })}
    </section>
  );
}
