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
import type { EducationMap } from '@/lib/activity-education';
import type { WorkspaceSelection } from '../AllocatorWorkspace';
import CalendarView from '@/components/CalendarView';

export interface CalendarTabProps {
  result: ScheduleResult;
  availability: AvailabilityBundle;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
  /** 023 — education profiles, for the inline action detail card in the day timeline. */
  education: EducationMap;
}

export default function CalendarTab({ result, availability, selection, onSelect, education }: CalendarTabProps) {
  return (
    <CalendarView
      result={result}
      memberBusy={availability.memberBusy}
      travel={availability.travel}
      homeTimeZone={availability.timeZone}
      // 023 follow-up: clicking an action only SELECTS it (stays on the calendar, preserves the
      // open day + month + filters, and feeds the chat context). The inline detail card offers an
      // opt-in "View full trace" — no aggressive auto tab-switch.
      onSelect={(occ: ScheduledOccurrence) =>
        onSelect({ selectedOccurrenceId: occ.id, selectedDate: occ.date })
      }
      onExpandDay={(date) => onSelect({ selectedDate: date })}
      selectedOccurrenceId={selection.selectedOccurrenceId}
      education={education}
      onViewTrace={(occ: ScheduledOccurrence) =>
        onSelect({ selectedOccurrenceId: occ.id, selectedDate: occ.date, activeTab: 'trace' })
      }
    />
  );
}
