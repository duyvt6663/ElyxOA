'use client';

/**
 * DECISION RECAP — 013
 * - Threads optional `diagnostics?: ScheduleDiagnostics` through to AllocationTraceTab
 *   only. Other tabs (Calendar, Actions, Priority, Resources, Data) are unaffected by
 *   diagnostics in V1. The trace tab tolerates `undefined` diagnostics with a soft
 *   fallback notice.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Right panel: composes TabNav + the active tab component.
 * - Stateless w.r.t. selection — receives selection + onSelect from AllocatorWorkspace.
 * - renderTab() switches on activeTab; only Calendar + Data wire real components in 011,
 *   the other 4 are 013-stubs.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render TabNav with activeTab + onChange=onTabChange.
 * 2. renderTab() returns the matching tab component with the props it needs.
 * 3. The active tab fills the remaining vertical space and scrolls if needed.
 */

import type { Activity, AvailabilityBundle, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
import type { TabId, WorkspaceSelection } from './AllocatorWorkspace';
import TabNav from './TabNav';
import CalendarTab from './tabs/CalendarTab';
import ActionListTab from './tabs/ActionListTab';
import PriorityQueueTab from './tabs/PriorityQueueTab';
import ResourcesTab from './tabs/ResourcesTab';
import AllocationTraceTab from './tabs/AllocationTraceTab';
import DataImportTab from './tabs/DataImportTab';

export interface WorkspacePanelProps {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
  result: ScheduleResult;
  activities: Activity[];
  availability: AvailabilityBundle;
  diagnostics?: ScheduleDiagnostics;
  setSchedule: (next: { result: ScheduleResult; diagnostics: ScheduleDiagnostics }) => void;
  resetSchedule: () => void;
}

export default function WorkspacePanel({
  activeTab,
  onTabChange,
  selection,
  onSelect,
  result,
  activities,
  availability,
  diagnostics,
  setSchedule,
  resetSchedule,
}: WorkspacePanelProps) {
  function renderTab() {
    switch (activeTab) {
      case 'calendar':
        return <CalendarTab result={result} selection={selection} onSelect={onSelect} />;
      case 'actions':
        return <ActionListTab activities={activities} result={result} selection={selection} onSelect={onSelect} />;
      case 'priority':
        return (
          <PriorityQueueTab
            activities={activities}
            result={result}
            selection={selection}
            onSelect={onSelect}
          />
        );
      case 'resources':
        return <ResourcesTab availability={availability} selection={selection} onSelect={onSelect} />;
      case 'trace':
        return <AllocationTraceTab selection={selection} diagnostics={diagnostics} />;
      case 'data':
        return (
          <DataImportTab
            result={result}
            activities={activities}
            availability={availability}
            setSchedule={setSchedule}
            resetSchedule={resetSchedule}
          />
        );
    }
  }

  return (
    <section className="flex flex-col h-full">
      <TabNav activeTab={activeTab} onChange={onTabChange} />
      <div className="flex-1 overflow-y-auto">{renderTab()}</div>
    </section>
  );
}
