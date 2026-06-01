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
 * DECISION RECAP — 019 Phase 1 Explicit Context
 * - Accepts the build-time `contextIndex` (page.tsx) and threads it + the held `result` to
 *   ChatSurface so @-autocomplete + ref navigation work with no API key (019 degraded mode).
 * - Owns the attached ContextBlock[] in TWO layers:
 *     ACTIVE (provenance 'selected'): DERIVED from `selection` each render — a `day` block from
 *       selectedDate and an `occurrence` block from selectedOccurrenceId — so they track selection.
 *     PERSISTENT (`extraBlocks`): pinned + @-mention blocks held in state until removed.
 *   A `dismissedSelectedKeys` set lets the user remove an active block; it reappears on the next
 *   selection change (per 019 open-decision 1 default: auto-add current day/action as active).
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Activity, AvailabilityBundle, ScheduleResult, ScheduleDiagnostics, SchedulingSemanticHints } from '@/lib/types';
import type { ContextBlock, ContextIndex } from '@/lib/chat-context';
import type { EducationMap } from '@/lib/activity-education';
import schedulingHints from '@/data/scheduling-hints.json';
import { scheduleTemporal } from '@/lib/temporal-scheduler';
import { isSchedulingSemanticHints, validateHintReferences } from '@/lib/validate';
import { applyPatchToInputs, describePatch, diffResults, validatePatch, ALL_WINDOWS, type SchedulePatch, type ScheduleDiff, type TimeWindow } from '@/lib/schedule-patch';
import AppHeader from './AppHeader';
import WindowLayout from './WindowLayout';
import MobileSwitch from './MobileSwitch';
import ChatSurface from './ChatSurface';
import WorkspacePanel from './WorkspacePanel';
import GuidedTour from './GuidedTour';
import HelpPanel from './HelpPanel';
import { TOUR_STEPS, TOUR_DONE_KEY, type TourStep } from './tourSteps';

/** 019 Phase 3 — result of previewing a draft patch (no commit). Carries a human description so the
 * preview card needs neither activities nor availability. `alternatives` (019 Phase 4 "why-not") lists
 * the other windows ranked by resulting skip count, present only when a setTemporalPolicy causes skips. */
export type PatchPreview =
  | { description: string; diff: ScheduleDiff; alternatives?: Array<{ window: TimeWindow; skipped: number }> }
  | { description: string; error: string };

export type TabId = 'calendar' | 'activities' | 'resources' | 'trace' | 'data';

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
  contextIndex: ContextIndex;
  /** 023: activity-education profiles keyed by activityId; forwarded to the Activities + Trace tabs. */
  education: EducationMap;
}

/** 019: abbreviate a YYYY-MM-DD into "Jun 22" for a chip label (window is Jun/Jul/Aug 2026). */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const mon = MONTH_ABBR[(m ?? 1) - 1] ?? date;
  return `${mon} ${d ?? ''}`.trim();
}

export default function AllocatorWorkspace({ result, activities, availability, diagnostics, contextIndex, education }: AllocatorWorkspaceProps) {
  const [displayedResult, setDisplayedResult] = useState<ScheduleResult>(result);
  const [displayedDiagnostics, setDisplayedDiagnostics] = useState<ScheduleDiagnostics | undefined>(diagnostics);
  const [selection, setSelection] = useState<WorkspaceSelection>({
    selectedOccurrenceId: null,
    selectedDate: null,
    activeTab: 'calendar',
  });
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'workspace'>('chat');

  // 020 guided tour: tourStep is the active 0-based step, or null when inactive. showPrompt is the
  // first-run "take a tour" nudge (shown once per browser).
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_DONE_KEY)) setShowPrompt(true);
    } catch {
      // localStorage unavailable (private mode) — just don't nudge.
    }
  }, []);
  const markTourDone = () => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1');
    } catch {
      // ignore
    }
  };

  // 019: persistent context blocks (pinned + @-mention); survive selection/tab changes.
  const [extraBlocks, setExtraBlocks] = useState<ContextBlock[]>([]);
  // 019: active (selected) block keys the user explicitly removed; cleared on selection change.
  const [dismissedSelectedKeys, setDismissedSelectedKeys] = useState<Set<string>>(new Set());

  // 019 Phase 3: the current effective scheduler INPUTS (seeded from props). A draft chat edit
  // patches a copy and reruns; Apply commits the patched inputs here. Imports stay a separate path.
  const [editedActivities, setEditedActivities] = useState<Activity[]>(activities);
  const [editedAvailability, setEditedAvailability] = useState<AvailabilityBundle>(availability);
  // 019 Phase 3: one-step undo — the schedule + inputs as they were before the last applied edit.
  const [undoSnapshot, setUndoSnapshot] = useState<null | {
    result: ScheduleResult;
    diagnostics: ScheduleDiagnostics | undefined;
    activities: Activity[];
    availability: AvailabilityBundle;
  }>(null);

  const select = (partial: Partial<WorkspaceSelection>) => {
    setSelection((prev) => ({ ...prev, ...partial }));
    // 016 §8: a chat link (or any tab change) on mobile must bring the Workspace pane forward,
    // otherwise the navigation silently happens behind the Chat pane and feels like a no-op.
    if (partial.activeTab) setMobilePanel('workspace');
    // 019: a new day/occurrence selection re-activates auto-added context blocks the user had
    // dismissed for the previous selection.
    if ('selectedDate' in partial || 'selectedOccurrenceId' in partial) {
      setDismissedSelectedKeys((prev) => (prev.size === 0 ? prev : new Set()));
    }
  };

  // 019: ACTIVE blocks derived from selection. A `day` block from selectedDate and an
  // `occurrence` block from selectedOccurrenceId; both auto-update as selection changes. Skipped
  // when the user dismissed them, or when an equivalent persistent (pinned/@) block already holds it.
  const selectedBlocks = useMemo<ContextBlock[]>(() => {
    const out: ContextBlock[] = [];
    const taken = new Set(extraBlocks.map((b) => b.key));
    if (selection.selectedDate) {
      const key = `day:${selection.selectedDate}`;
      if (!taken.has(key) && !dismissedSelectedKeys.has(key)) {
        out.push({
          key,
          ref: { type: 'day', date: selection.selectedDate },
          provenance: 'selected',
          pinned: false,
          label: `Day ${shortDate(selection.selectedDate)}`,
        });
      }
    }
    if (selection.selectedOccurrenceId) {
      const key = `occurrence:${selection.selectedOccurrenceId}`;
      if (!taken.has(key) && !dismissedSelectedKeys.has(key)) {
        const occ = displayedResult.occurrences.find((o) => o.id === selection.selectedOccurrenceId);
        out.push({
          key,
          ref: { type: 'occurrence', occurrenceId: selection.selectedOccurrenceId },
          provenance: 'selected',
          pinned: false,
          label: `Action ${occ?.title ?? selection.selectedOccurrenceId}`,
        });
      }
    }
    return out;
  }, [selection.selectedDate, selection.selectedOccurrenceId, displayedResult, extraBlocks, dismissedSelectedKeys]);

  const contextBlocks = useMemo<ContextBlock[]>(
    () => [...selectedBlocks, ...extraBlocks],
    [selectedBlocks, extraBlocks]
  );

  // 019: add a persistent block from an @-mention selection (provenance 'atMention'). Deduped by key.
  const addContextBlock = useCallback((block: ContextBlock) => {
    setExtraBlocks((prev) => (prev.some((b) => b.key === block.key) ? prev : [...prev, block]));
  }, []);

  // 019: removing a block guarantees it is NOT sent on the next request. Persistent blocks drop
  // from state; an active (selected) block is recorded as dismissed so it stops deriving.
  const removeContextBlock = useCallback((key: string) => {
    let removedFromExtras = false;
    setExtraBlocks((prev) => {
      if (!prev.some((b) => b.key === key)) return prev;
      removedFromExtras = true;
      return prev.filter((b) => b.key !== key);
    });
    if (!removedFromExtras) {
      setDismissedSelectedKeys((d) => {
        if (d.has(key)) return d;
        const next = new Set(d);
        next.add(key);
        return next;
      });
    }
  }, []);

  // 019: pin toggle. Pinning an active (selected) block promotes it into persistent state so it
  // survives selection changes; unpinning a persistent block keeps it but clears the pin flag.
  const toggleContextPin = useCallback((key: string) => {
    setExtraBlocks((prev) => {
      const existing = prev.find((b) => b.key === key);
      if (existing) {
        return prev.map((b) => (b.key === key ? { ...b, pinned: !b.pinned } : b));
      }
      const active = selectedBlocks.find((b) => b.key === key);
      if (!active) return prev;
      return [...prev, { ...active, provenance: 'pinned', pinned: true }];
    });
  }, [selectedBlocks]);

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
    // 019: a full reset also discards chat-edited inputs + the undo snapshot, so the schedule and the
    // "edited" signal return to the build-time original.
    setEditedActivities(activities);
    setEditedAvailability(availability);
    setUndoSnapshot(null);
  }, [result, diagnostics, activities, availability]);

  // 019: chat edits replace the inputs with new arrays/objects, so reference inequality flags an edit.
  const isEdited = editedActivities !== activities || editedAvailability !== availability;

  // 019 Phase 3: rerun the TEMPORAL scheduler client-side (same path as the Data Import flow),
  // applying committed hints only while they still validate against the (possibly edited) inputs.
  const rerunWith = useCallback((acts: Activity[], av: AvailabilityBundle) => {
    const hintsOk =
      isSchedulingSemanticHints(schedulingHints) &&
      validateHintReferences(schedulingHints as SchedulingSemanticHints, acts, av).length === 0;
    return scheduleTemporal(acts, av, hintsOk ? (schedulingHints as SchedulingSemanticHints) : undefined);
  }, []);

  // 019 Phase 3: preview a draft patch — apply to a COPY of the inputs, rerun, diff vs the displayed
  // result. NO commit (decision 4 + no silent mutations).
  const previewPatch = useCallback(
    (patch: SchedulePatch): PatchPreview => {
      const description = describePatch(patch, editedActivities, editedAvailability);
      const err = validatePatch(patch, editedActivities, editedAvailability);
      if (err) return { description, error: err };
      const patched = applyPatchToInputs(patch, editedActivities, editedAvailability);
      const next = rerunWith(patched.activities, patched.availability);
      const diff = diffResults(displayedResult, next.result);
      // 019 Phase 4 "why-not": when a retime causes skips, try the OTHER windows deterministically and
      // rank them by resulting skip count, so the card can point at a feasible alternative.
      let alternatives: Array<{ window: TimeWindow; skipped: number }> | undefined;
      if (patch.kind === 'setTemporalPolicy' && diff.nowSkipped.length > 0) {
        alternatives = ALL_WINDOWS.filter((w) => w !== patch.window)
          .map((w) => {
            const alt = applyPatchToInputs({ ...patch, window: w }, editedActivities, editedAvailability);
            const altRes = rerunWith(alt.activities, alt.availability);
            return { window: w, skipped: diffResults(displayedResult, altRes.result).nowSkipped.length };
          })
          .sort((a, b) => a.skipped - b.skipped);
      }
      return { description, diff, alternatives };
    },
    [editedActivities, editedAvailability, displayedResult, rerunWith]
  );

  // 019 Phase 3: Apply a draft patch — snapshot for undo, commit the patched inputs + rerun result.
  const applyPatch = useCallback(
    (patch: SchedulePatch): { error: string } | null => {
      const err = validatePatch(patch, editedActivities, editedAvailability);
      if (err) return { error: err };
      const patched = applyPatchToInputs(patch, editedActivities, editedAvailability);
      const next = rerunWith(patched.activities, patched.availability);
      setUndoSnapshot({
        result: displayedResult,
        diagnostics: displayedDiagnostics,
        activities: editedActivities,
        availability: editedAvailability,
      });
      setEditedActivities(patched.activities);
      setEditedAvailability(patched.availability);
      setDisplayedResult(next.result);
      setDisplayedDiagnostics(next.diagnostics);
      return null;
    },
    [editedActivities, editedAvailability, displayedResult, displayedDiagnostics, rerunWith]
  );

  const undoLastEdit = useCallback(() => {
    setUndoSnapshot((snap) => {
      if (!snap) return null;
      setDisplayedResult(snap.result);
      setDisplayedDiagnostics(snap.diagnostics);
      setEditedActivities(snap.activities);
      setEditedAvailability(snap.availability);
      return null;
    });
  }, []);

  // 019 Phase 4: export the current effective INPUTS as JSON. Re-importable via the Data tab to
  // reproduce the schedule (the result is derived), for reproducible teammate review.
  const exportState = useCallback(() => {
    const data = JSON.stringify({ activities: editedActivities, availability: editedAvailability }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elyx-workspace.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [editedActivities, editedAvailability]);

  // 020 tour controls.
  const startTour = () => {
    setShowPrompt(false);
    setTourStep(0);
  };
  const endTour = () => {
    setTourStep(null);
    markTourDone();
  };
  const dismissPrompt = () => {
    setShowPrompt(false);
    markTourDone();
  };
  const onTourPrepare = (step: TourStep) => {
    if (step.prepare === 'chat') {
      setMobilePanel('chat');
    } else if (step.prepare === 'calendar') {
      select({ activeTab: 'calendar' });
    } else if (step.prepare === 'traceDemo') {
      const demo = displayedResult.occurrences.find((o) => o.status === 'substituted' || o.status === 'skipped');
      if (demo) select({ selectedOccurrenceId: demo.id, selectedDate: demo.date, activeTab: 'trace' });
      else select({ activeTab: 'trace' });
    }
  };

  const chat = (
    <ChatSurface
      selection={selection}
      result={displayedResult}
      diagnostics={displayedDiagnostics}
      activities={editedActivities}
      onSelect={select}
      contextIndex={contextIndex}
      contextBlocks={contextBlocks}
      onAddContext={addContextBlock}
      onRemoveContext={removeContextBlock}
      onTogglePin={toggleContextPin}
      onPreviewPatch={previewPatch}
      onApplyPatch={applyPatch}
      canUndo={undoSnapshot !== null}
      onUndo={undoLastEdit}
      onExport={exportState}
    />
  );
  const workspace = (
    <WorkspacePanel
      activeTab={selection.activeTab}
      onTabChange={(t) => select({ activeTab: t })}
      selection={selection}
      onSelect={select}
      result={displayedResult}
      // 019 follow-up: the panel must reflect the EFFECTIVE (chat-edited) inputs, not the build-time
      // originals — otherwise a committed addTravelWindow/addBusyBlock/setTemporalPolicy lands in
      // editedAvailability/editedActivities (and displayedResult) but the calendar's travel/busy
      // overlays + activity list keep reading the stale originals, so the edit looks unapplied.
      activities={editedActivities}
      availability={editedAvailability}
      diagnostics={displayedDiagnostics}
      education={education}
      setSchedule={setSchedule}
      resetSchedule={resetSchedule}
    />
  );

  return (
    <>
      <AppHeader result={displayedResult} edited={isEdited} onReset={resetSchedule} onOpenHelp={() => setHelpOpen(true)} homeTimeZone={availability.timeZone} />
      {/* md+: side-by-side */}
      <WindowLayout left={chat} right={workspace} />
      {/* <md: switch + single panel */}
      <div className="md:hidden flex flex-col h-[calc(100vh-3.5rem)]">
        <MobileSwitch value={mobilePanel} onChange={setMobilePanel} />
        <div className="flex-1 overflow-hidden">
          {mobilePanel === 'chat' ? chat : workspace}
        </div>
      </div>

      {/* 020 first-run nudge (once per browser). Bottom-RIGHT corner so it never overlaps the chat
          composer or calendar interactions (incl. the acceptance suite). */}
      {showPrompt && tourStep === null && (
        <div className="fixed bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="text-sm font-medium text-gray-900">New here? Take a 90-second tour</div>
          <p className="mt-0.5 text-xs text-gray-500">
            See how the plan becomes an adaptive calendar you can explain and edit.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={startTour} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
              Start tour
            </button>
            <button type="button" onClick={dismissPrompt} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* 020 guided tour overlay. */}
      {tourStep !== null && (
        <GuidedTour
          stepIndex={tourStep}
          onPrepare={onTourPrepare}
          onBack={() => setTourStep((s) => (s === null ? null : Math.max(s - 1, 0)))}
          onNext={() => setTourStep((s) => (s === null ? null : Math.min(s + 1, TOUR_STEPS.length - 1)))}
          onSkip={endTour}
          onFinish={endTour}
        />
      )}

      {/* 020 help hub. */}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} onStartTour={startTour} />}
    </>
  );
}
