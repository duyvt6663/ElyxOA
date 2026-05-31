/**
 * DECISION RECAP — timezone manifestation
 * - The customer's HOME timezone is AvailabilityBundle.timeZone (America/Los_Angeles). The scheduler
 *   expresses ALL occurrence times in that home tz (temporal-scheduler.ts), and services/resources are
 *   assumed to be at the home location (their availability is in home time too).
 * - Travel destinations carry an optional IANA timeZone (TravelPlan.timeZone). On travel days the
 *   member is physically in that zone; this module computes the offset + the difference vs home so the
 *   UI can annotate it. (The schedule itself stays in home time — in-person home actions are dropped or
 *   substituted during travel; this is the app's stated assumption, surfaced rather than hidden.)
 * - Offsets are computed with Intl so DST is handled correctly for the given date.
 */

/** Minutes east of UTC for `tz` at noon on `isoDate` (DST-correct). */
export function utcOffsetMinutes(tz: string, isoDate: string): number {
  try {
    const at = new Date(`${isoDate}T12:00:00Z`);
    const local = new Date(at.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((local.getTime() - utc.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** "UTC+8", "UTC-7", "UTC+5:30". */
export function offsetLabel(tz: string, isoDate: string): string {
  const m = utcOffsetMinutes(tz, isoDate);
  const sign = m >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(m) / 60);
  const mm = Math.abs(m) % 60;
  return `UTC${sign}${h}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
}

/** "15h ahead of home", "3h behind home", "same as home". */
export function diffLabel(homeTz: string, destTz: string, isoDate: string): string {
  const d = (utcOffsetMinutes(destTz, isoDate) - utcOffsetMinutes(homeTz, isoDate)) / 60;
  if (d === 0) return 'same time as home';
  const h = Math.abs(d) % 1 === 0 ? String(Math.abs(d)) : Math.abs(d).toFixed(1);
  return `${h}h ${d > 0 ? 'ahead of' : 'behind'} home`;
}

/** "+15h", "-3h", "±0" — compact difference for an inline badge. */
export function diffCompact(homeTz: string, destTz: string, isoDate: string): string {
  const d = (utcOffsetMinutes(destTz, isoDate) - utcOffsetMinutes(homeTz, isoDate)) / 60;
  if (d === 0) return '±0';
  const h = Math.abs(d) % 1 === 0 ? String(Math.abs(d)) : Math.abs(d).toFixed(1);
  return `${d > 0 ? '+' : '-'}${h}h`;
}

const FRIENDLY: Record<string, string> = {
  'America/Los_Angeles': 'Pacific',
  'America/New_York': 'Eastern',
  'America/Chicago': 'Central',
  'Asia/Singapore': 'Singapore',
  'Asia/Tokyo': 'Tokyo',
};

/** A short human place label, e.g. "Pacific" / "Singapore". */
export function placeLabel(tz: string): string {
  return FRIENDLY[tz] ?? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}

/** "Pacific · UTC-7" — for the always-visible home-tz chip. */
export function homeTzLabel(tz: string, isoDate: string): string {
  return `${placeLabel(tz)} · ${offsetLabel(tz, isoDate)}`;
}
