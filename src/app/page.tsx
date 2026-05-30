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
import { scheduleWithDiagnostics } from '@/lib/scheduler';
import { isActivity, isAvailabilityBundle } from '@/lib/validate';
import AllocatorWorkspace from '@/components/workspace/AllocatorWorkspace';

const activities = (activitiesData as unknown[]).map((x, i) => {
  if (!isActivity(x)) throw new Error(`activities.json[${i}] failed validation`);
  return x;
});
if (!isAvailabilityBundle(availabilityData)) {
  throw new Error('availability.json failed validation');
}
const availability = availabilityData;

const { result, diagnostics } = scheduleWithDiagnostics(activities, availability);

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
