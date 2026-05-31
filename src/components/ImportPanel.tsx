'use client';

/**
 * INTEGRATION TODO (out of scope for 009 skeleton)
 * -------------------------------------------------
 * Integration via 014/009 fix: workspace owns the result state; ImportPanel is a
 * controlled component. AllocatorWorkspace seeds `displayedResult` +
 * `displayedDiagnostics` from build-time fixtures and threads `onScheduleUpdate` /
 * `onScheduleReset` through DataImportTab to here. A successful Rerun propagates
 * to every tab (Calendar, Actions, Priority, Resources, Trace) and the chat
 * surface — not only the Data tab.
 */

/**
 * DECISION RECAP — 009 Runtime Import And Rerun Schedule (Stretch)
 * - Browser-only upload of replacement `activities.json` and/or `availability.json`.
 * - No backend, no persistence, no auth, no API routes, no server actions.
 * - Imported JSON MUST pass `@/lib/validate` guards before being accepted.
 * - On valid import + Rerun: call `schedule()` in browser state and re-render
 *   `<CalendarView />` with the new result.
 * - If only one file is imported, combine it with the committed fixture for
 *   the other input (via `?? fallbackX`).
 * - Validation errors are shown inline as concise red text; the currently
 *   displayed plan is NOT replaced when input is invalid.
 * - Reset returns `displayedResult` to the committed-fixture `fallbackResult`.
 * - Stretch is NOT integrated into page.tsx in V1 (see INTEGRATION TODO above).
 */

/**
 * BEHAVIOR SKETCH
 * 1. User picks a file via one of the two <input type="file"> controls.
 * 2. Handler reads file as text, JSON.parses, then validates at the boundary
 *    using `isActivity` (per-element over the parsed array) or
 *    `isAvailabilityBundle` (single object).
 * 3. On failure: push concise message(s) into `errors`; do NOT mutate the
 *    currently displayed plan. On success: store parsed value in
 *    `importedActivities` / `importedAvailability` and clear related errors.
 * 4. On Rerun: call
 *      scheduleWithDiagnostics(importedActivities ?? fallbackActivities,
 *                              importedAvailability ?? fallbackAvailability)
 *    purely in-browser and call onScheduleUpdate(next) so the workspace root
 *    (AllocatorWorkspace) updates its displayedResult + displayedDiagnostics —
 *    propagating the new schedule to every tab and the chat surface.
 * 5. State lives at the workspace root (014/009 fix); ImportPanel is now a
 *    controlled toolbar with no internal CalendarView. Calendar/Actions/
 *    Priority/Resources/Trace tabs re-render via the workspace's displayed* props.
 * 6. Reset clears imported state + errors and calls onScheduleReset() so the
 *    workspace restores its displayed* to the committed-fixture values.
 */

import { useState } from 'react';
import type {
  Activity,
  AvailabilityBundle,
  ScheduleResult,
  ScheduleDiagnostics,
  SchedulingSemanticHints,
} from '@/lib/types';
import { isActivity, isAvailabilityBundle, isSchedulingSemanticHints, validateHintReferences } from '@/lib/validate';
import { scheduleTemporal } from '@/lib/temporal-scheduler';
import schedulingHints from '@/data/scheduling-hints.json';

interface ImportPanelProps {
  /** Committed-fixture result computed at build time; baseline + reset target. */
  fallbackResult: ScheduleResult;
  /** Committed-fixture inputs, used to fill the side the user didn't import. */
  fallbackActivities: Activity[];
  fallbackAvailability: AvailabilityBundle;
  /** Workspace-root setter; propagates the new schedule to every tab. */
  onScheduleUpdate: (next: { result: ScheduleResult; diagnostics: ScheduleDiagnostics }) => void;
  /** Workspace-root reset; restores fallback result + diagnostics. */
  onScheduleReset: () => void;
}

export default function ImportPanel({
  fallbackResult: _fallbackResult,
  fallbackActivities,
  fallbackAvailability,
  onScheduleUpdate,
  onScheduleReset,
}: ImportPanelProps) {
  const [importedActivities, setImportedActivities] = useState<Activity[] | null>(null);
  const [importedAvailability, setImportedAvailability] = useState<AvailabilityBundle | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [hintStatus, setHintStatus] = useState<string | null>(null);

  async function handleActivitiesFile(file: File): Promise<void> {
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setErrors((prev) => [
        ...prev.filter((e) => !e.startsWith('Activities')),
        'Activities JSON is not valid JSON',
      ]);
      return;
    }
    if (!Array.isArray(parsed)) {
      setErrors((prev) => [
        ...prev.filter((e) => !e.startsWith('Activities')),
        'Activities JSON must be an array',
      ]);
      return;
    }
    const badIndex = (parsed as unknown[]).findIndex((el) => !isActivity(el));
    if (badIndex !== -1) {
      setErrors((prev) => [
        ...prev.filter((e) => !e.startsWith('Activities')),
        `Activities JSON failed validation (element ${badIndex} invalid)`,
      ]);
      return;
    }
    setErrors((prev) => prev.filter((e) => !e.startsWith('Activities')));
    setImportedActivities(parsed as Activity[]);
  }

  async function handleAvailabilityFile(file: File): Promise<void> {
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setErrors((prev) => [
        ...prev.filter((e) => !e.startsWith('Availability')),
        'Availability JSON is not valid JSON',
      ]);
      return;
    }
    if (!isAvailabilityBundle(parsed)) {
      setErrors((prev) => [
        ...prev.filter((e) => !e.startsWith('Availability')),
        'Availability JSON failed validation (not a valid AvailabilityBundle)',
      ]);
      return;
    }
    setErrors((prev) => prev.filter((e) => !e.startsWith('Availability')));
    setImportedAvailability(parsed);
  }

  function rerun(): void {
    const acts = importedActivities ?? fallbackActivities;
    const av = importedAvailability ?? fallbackAvailability;
    // 015/016: rerun on the TEMPORAL scheduler (not the date-only one) so imports produce
    // time-placed occurrences consistent with the rest of the app. Committed hints apply
    // only if they still validate against this (possibly imported) bundle; else fall back
    // deterministically. This keeps a stale-reference import honest.
    const imported = importedActivities !== null || importedAvailability !== null;
    const hintsOk =
      isSchedulingSemanticHints(schedulingHints) &&
      validateHintReferences(schedulingHints as SchedulingSemanticHints, acts, av).length === 0;
    const next = scheduleTemporal(acts, av, hintsOk ? (schedulingHints as SchedulingSemanticHints) : undefined);
    onScheduleUpdate(next);
    setHintStatus(
      hintsOk
        ? imported
          ? 'committed hints applied (valid for import)'
          : 'committed hints applied'
        : 'imported bundle invalidates committed hints → deterministic fallback policies',
    );
  }

  function reset(): void {
    setImportedActivities(null);
    setImportedAvailability(null);
    setErrors([]);
    setHintStatus(null);
    onScheduleReset();
  }

  return (
    <section className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 rounded border bg-gray-50 p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-700">Activities JSON</span>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleActivitiesFile(f);
            }}
            className="text-xs"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-700">Availability JSON</span>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAvailabilityFile(f);
            }}
            className="text-xs"
          />
        </label>

        <button
          type="button"
          onClick={rerun}
          disabled={importedActivities === null && importedAvailability === null}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          Rerun
        </button>

        <button
          type="button"
          onClick={reset}
          className="px-3 py-1 rounded bg-gray-200 text-gray-800 text-sm"
        >
          Reset
        </button>

        <span className="text-xs text-gray-600">
          Activities: {importedActivities ? 'imported' : 'fixture'} · Availability: {importedAvailability ? 'imported' : 'fixture'}
        </span>
      </div>

      {hintStatus && (
        <p className="text-xs text-gray-500">
          Scheduling hints: <span className="font-medium text-gray-700">{hintStatus}</span>
        </p>
      )}

      {errors.length > 0 && (
        <ul className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex flex-col gap-1">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </section>
  );
}
