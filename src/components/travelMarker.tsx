/**
 * DECISION RECAP — 019 follow-up: calendar travel marker
 * - Travel is the assignment's headline adaptation driver but was only visible in Resources → Travel
 *   and indirectly via skip/substitute pills; nothing flagged trip days on the calendar itself.
 * - This shared helper + badge mark a date that falls inside any TravelPlan.blocked range, used by
 *   both DayCell (month grid) and AgendaList (mobile) so the marker is identical in both.
 */

import type { TravelPlan } from '@/lib/types';

/** The destination of the trip covering `date` (YYYY-MM-DD), or null. String date compare is safe. */
export function travelDestinationForDate(travel: TravelPlan[] | undefined, date: string): string | null {
  if (!travel) return null;
  for (const t of travel) {
    for (const r of t.blocked) {
      if (date >= r.start && date <= r.end) return t.destination;
    }
  }
  return null;
}

export function TravelBadge({ destination, className = '' }: { destination: string; className?: string }) {
  return (
    <span
      title={`Travel: ${destination} — in-person actions may be substituted or skipped`}
      className={`inline-flex max-w-full items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 ${className}`}
    >
      <span aria-hidden>✈</span>
      <span className="truncate">{destination}</span>
    </span>
  );
}
