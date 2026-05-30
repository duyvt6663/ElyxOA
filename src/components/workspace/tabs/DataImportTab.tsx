/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Real wire: surfaces the existing ImportPanel inside the Data tab.
 * - Passes build-time fixtures as the fallback so reset/rerun still work.
 * - No new logic — ImportPanel already owns its UX.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render <ImportPanel/> with fallbackResult/fallbackActivities/fallbackAvailability.
 */

import type { Activity, AvailabilityBundle, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
import ImportPanel from '@/components/ImportPanel';

export interface DataImportTabProps {
  result: ScheduleResult;
  activities: Activity[];
  availability: AvailabilityBundle;
  setSchedule: (next: { result: ScheduleResult; diagnostics: ScheduleDiagnostics }) => void;
  resetSchedule: () => void;
}

export default function DataImportTab({
  result,
  activities,
  availability,
  setSchedule,
  resetSchedule,
}: DataImportTabProps) {
  return (
    <ImportPanel
      fallbackResult={result}
      fallbackActivities={activities}
      fallbackAvailability={availability}
      onScheduleUpdate={setSchedule}
      onScheduleReset={resetSchedule}
    />
  );
}
