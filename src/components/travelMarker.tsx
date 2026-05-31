/**
 * DECISION RECAP — calendar travel marker + timezone annotation
 * - Travel is the assignment's headline adaptation driver. This shared helper + badge mark a date that
 *   falls inside any TravelPlan.blocked range, used by both DayCell (month grid) and AgendaList.
 * - Timezone manifestation: the badge shows the destination's offset vs home (e.g. "✈ Singapore +15h")
 *   and a title explaining that, on travel days, in-person home actions are dropped/substituted while
 *   the schedule stays in home time (see src/lib/timezone.ts).
 */

import type { TravelPlan } from '@/lib/types';
import { offsetLabel, diffLabel, diffCompact } from '@/lib/timezone';

/** The trip covering `date` (YYYY-MM-DD), or null. String date compare is safe. */
export function travelForDate(travel: TravelPlan[] | undefined, date: string): TravelPlan | null {
  if (!travel) return null;
  for (const t of travel) {
    for (const r of t.blocked) {
      if (date >= r.start && date <= r.end) return t;
    }
  }
  return null;
}

export function TravelBadge({
  trip,
  date,
  homeTimeZone,
  className = '',
}: {
  trip: TravelPlan;
  date: string;
  homeTimeZone?: string;
  className?: string;
}) {
  const tz = trip.timeZone;
  const title =
    tz && homeTimeZone
      ? `${trip.destination} — local ${offsetLabel(tz, date)}, ${diffLabel(homeTimeZone, tz, date)}. On travel days the member is away: in-person home actions are dropped or substituted, and the schedule stays in home time.`
      : `Travel: ${trip.destination} — in-person actions may be substituted or skipped`;
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 ${className}`}
    >
      <span aria-hidden>✈</span>
      <span className="truncate">{trip.destination}</span>
      {tz && homeTimeZone && <span className="shrink-0 opacity-70">{diffCompact(homeTimeZone, tz, date)}</span>}
    </span>
  );
}
