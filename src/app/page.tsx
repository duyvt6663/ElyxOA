/**
 * DECISION RECAP — 013
 * - Swaps `schedule(...)` for `scheduleWithDiagnostics(...)` (from 012) so the workspace
 *   can show the Allocation Trace tab + ground the LLM chat with real traces. Both the
 *   `result` and the `diagnostics` flow down through AllocatorWorkspace.
 */

/**
 * DECISION RECAP — 006 Render Calendar Output
 * - V1 entry point; replaces the 001 placeholder.
 * - Server Component (no 'use client'): imports fixtures + scheduler at module scope.
 * - Calls schedule(activities, availability) ONCE on the server; passes result down.
 * - CalendarView (client) owns month + filter state; UI does NOT call schedule().
 * - JSON fixtures cast via `as unknown as <Type>` at the import boundary
 *   pending validation via @/lib/validate.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Import activities + availability JSON fixtures and cast to canonical types.
 * 2. Call scheduleWithDiagnostics(activities, availability) -> { result, diagnostics }. (013: was schedule(...))
 * 3. Render <main><AllocatorWorkspace .../></main>. (011: swapped CalendarView for the
 *    new workspace shell — chat-left + tabbed-right; CalendarView is now nested inside
 *    the Calendar tab.)
 */

import activitiesData from '@/data/activities.json';
import availabilityData from '@/data/availability.json';
import schedulingHintsData from '@/data/scheduling-hints.json';
import { scheduleTemporal } from '@/lib/temporal-scheduler';
import {
  isActivity,
  isAvailabilityBundle,
  isSchedulingSemanticHints,
  validateHintReferences,
} from '@/lib/validate';
import AllocatorWorkspace from '@/components/workspace/AllocatorWorkspace';

const activities = (activitiesData as unknown[]).map((x, i) => {
  if (!isActivity(x)) throw new Error(`activities.json[${i}] failed validation`);
  return x;
});
if (!isAvailabilityBundle(availabilityData)) {
  throw new Error('availability.json failed validation');
}
const availability = availabilityData;

// 015: validate the committed LLM hints at the build boundary. Schema failure OR a stale
// reference (activity/busy-block id that no longer exists) throws here and breaks the build,
// so scheduling-hints.json can never silently drift out of sync with the fixtures.
if (!isSchedulingSemanticHints(schedulingHintsData)) {
  throw new Error('scheduling-hints.json failed schema validation');
}
const hintRefErrors = validateHintReferences(schedulingHintsData, activities, availability);
if (hintRefErrors.length > 0) {
  throw new Error(`scheduling-hints.json has stale references:\n- ${hintRefErrors.join('\n- ')}`);
}

// 015: temporal scheduler — places actions into { date, startTime, endTime } around the
// member's occupied blocks (availability.memberBusy). Validated LLM hints supply temporal
// policies for activities without an explicit override (merge: explicit > hint > default).
const { result, diagnostics } = scheduleTemporal(activities, availability, schedulingHintsData);

export default function Page() {
  return (
    <main className="min-h-dvh">
      <AllocatorWorkspace
        result={result}
        activities={activities}
        availability={availability}
        diagnostics={diagnostics}
      />
    </main>
  );
}
