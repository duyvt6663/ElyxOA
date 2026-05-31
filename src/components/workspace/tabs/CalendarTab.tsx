/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Wraps the existing <CalendarView/> unchanged in implementation.
 * - Passes an onSelect callback that maps an occurrence click → selection update.
 * - Actual chip-click wiring inside CalendarView is left as a TODO for 011 impl
 *   (the prop is declared but not yet invoked from chip rendering).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render <CalendarView result={result} onSelect={...} />.
 * 2. onSelect translates an occurrence into a selection patch and calls onSelect prop.
 */

import type { AvailabilityBundle, ScheduleResult, ScheduledOccurrence } from '@/lib/types';
import type { WorkspaceSelection } from '../AllocatorWorkspace';
import CalendarView from '@/components/CalendarView';

export interface CalendarTabProps {
  result: ScheduleResult;
  availability: AvailabilityBundle;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
}

export default function CalendarTab({ result, availability, selection: _selection, onSelect }: CalendarTabProps) {
  return (
    <CalendarView
      result={result}
      memberBusy={availability.memberBusy}
      travel={availability.travel}
      homeTimeZone={availability.timeZone}
      onSelect={(occ: ScheduledOccurrence) =>
        // 023: opening an action's detail = its Trace, where timing/status/resources + the
        // "About this action" education live.
        onSelect({ selectedOccurrenceId: occ.id, selectedDate: occ.date, activeTab: 'trace' })
      }
      onExpandDay={(date) => onSelect({ selectedDate: date })}
    />
  );
}
