'use client';

/**
 * DECISION RECAP — 014/009 fix Import State Hoist
 * - Schedule state (`displayedResult` + `displayedDiagnostics`) now lives at the workspace
 *   root, not inside ImportPanel. The build-time fixture result/diagnostics seed the state.
 * - `setSchedule` and `resetSchedule` are threaded down to DataImportTab → ImportPanel so a
 *   successful import propagates to every tab (Calendar, Actions, Priority, Resources,
 *   Trace) and the chat surface — not only the Data tab's mini-calendar.
 * - ImportPanel becomes a controlled toolbar (no internal CalendarView); the workspace
 *   re-renders every tab via the new displayed* props.
 */

/**
 * DECISION RECAP — 013 (sibling)
 * - Adds optional `diagnostics?: ScheduleDiagnostics` prop, threaded down to
 *   ChatSurface (for grounding) and WorkspacePanel (for the Allocation Trace tab).
 * - Optional because 012's `scheduleWithDiagnostics` body is still TODO; the workspace
 *   must remain renderable without real diagnostics so the calendar/data flow keeps
 *   working independently. Tabs that depend on diagnostics render a soft fallback.
 * - DataImportTab no longer needs `availability` from ChatSurface's perspective;
 *   ChatSurface receives `result + diagnostics + activities` only.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Owns the shared selection state ({ selectedOccurrenceId, selectedDate, activeTab })
 *   in a single useState; threads down via props (no Context, no Zustand).
 * - Owns the mobile panel toggle ('chat' | 'workspace') in a separate useState; only
 *   meaningful at <md viewport.
 * - Viewport split is CSS-driven (md:hidden / hidden md:grid) to keep SSR pure.
 * - Renders <AppHeader/> then either WindowLayout (md+) or MobileSwitch + one panel (<md).
 * - Exports TabId + WorkspaceSelection types — 011 owns these.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Initialize selection = { selectedOccurrenceId: null, selectedDate: null, activeTab: 'calendar' }.
 * 2. Initialize mobilePanel = 'chat'.
 * 3. Define select(partial) => merge into selection.
 * 4. Render AppHeader.
 * 5. md+: render WindowLayout(left=ChatSurface, right=WorkspacePanel).
 * 6. <md: render MobileSwitch, then the active panel only (ChatSurface OR WorkspacePanel).
 */

import { useCallback, useState } from 'react';
import type { Activity, AvailabilityBundle, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
import AppHeader from './AppHeader';
import WindowLayout from './WindowLayout';
import MobileSwitch from './MobileSwitch';
import ChatSurface from './ChatSurface';
import WorkspacePanel from './WorkspacePanel';

export type TabId = 'calendar' | 'actions' | 'priority' | 'resources' | 'trace' | 'data';

export interface WorkspaceSelection {
  selectedOccurrenceId: string | null;
  selectedDate: string | null;
  activeTab: TabId;
}

export interface AllocatorWorkspaceProps {
  result: ScheduleResult;
  activities: Activity[];
  availability: AvailabilityBundle;
  diagnostics?: ScheduleDiagnostics;
}

export default function AllocatorWorkspace({ result, activities, availability, diagnostics }: AllocatorWorkspaceProps) {
  const [displayedResult, setDisplayedResult] = useState<ScheduleResult>(result);
  const [displayedDiagnostics, setDisplayedDiagnostics] = useState<ScheduleDiagnostics | undefined>(diagnostics);
  const [selection, setSelection] = useState<WorkspaceSelection>({
    selectedOccurrenceId: null,
    selectedDate: null,
    activeTab: 'calendar',
  });
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'workspace'>('chat');

  const select = (partial: Partial<WorkspaceSelection>) => {
    setSelection((prev) => ({ ...prev, ...partial }));
  };

  const setSchedule = useCallback(
    (next: { result: ScheduleResult; diagnostics: ScheduleDiagnostics }) => {
      setDisplayedResult(next.result);
      setDisplayedDiagnostics(next.diagnostics);
    },
    []
  );

  const resetSchedule = useCallback(() => {
    setDisplayedResult(result);
    setDisplayedDiagnostics(diagnostics);
  }, [result, diagnostics]);

  const chat = (
    <ChatSurface
      selection={selection}
      result={displayedResult}
      diagnostics={displayedDiagnostics}
      activities={activities}
      onSelect={select}
    />
  );
  const workspace = (
    <WorkspacePanel
      activeTab={selection.activeTab}
      onTabChange={(t) => select({ activeTab: t })}
      selection={selection}
      onSelect={select}
      result={displayedResult}
      activities={activities}
      availability={availability}
      diagnostics={displayedDiagnostics}
      setSchedule={setSchedule}
      resetSchedule={resetSchedule}
    />
  );

  return (
    <>
      <AppHeader result={displayedResult} />
      {/* md+: side-by-side */}
      <WindowLayout left={chat} right={workspace} />
      {/* <md: switch + single panel */}
      <div className="md:hidden flex flex-col h-[calc(100vh-3.5rem)]">
        <MobileSwitch value={mobilePanel} onChange={setMobilePanel} />
        <div className="flex-1 overflow-hidden">
          {mobilePanel === 'chat' ? chat : workspace}
        </div>
      </div>
    </>
  );
}
