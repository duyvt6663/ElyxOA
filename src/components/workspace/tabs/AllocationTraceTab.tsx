/**
 * DECISION RECAP — 013 Allocation Trace Tab
 * - Reads `ScheduleDiagnostics.traces` (from 012) and renders ONE trace at a time —
 *   the trace for `selection.selectedOccurrenceId`. Open Question §5 (013 plan):
 *   we deliberately do NOT virtualize the full 9000-trace list; the Calendar and
 *   Resources tabs are the entry points for selection.
 * - Empty selection → centered prompt asking the user to click an occurrence.
 * - Trace render shape:
 *     Header — occurrence id, target date, status, source activity id.
 *     Body   — numbered list of AllocationAttempt cards. Each card shows
 *              candidateActivityId, isPrimary, feasible. If feasible: boundResources
 *              pills. If not feasible: failedConstraints pills with role/resourceId.
 *              Chosen attempt highlighted with `border-green-500 ring-2`.
 * - If diagnostics is undefined OR the trace is missing (e.g. 012 impl not yet
 *   producing them), render a small "Trace not yet available (012 impl pending)" notice
 *   so the page never throws.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - 011 stub. Real content lands in 013.
 * - 013 will add a `diagnostics: ScheduleDiagnostics` prop (from 012); not imported here
 *   yet because 012 hasn't landed in types.ts.
 */

/**
 * BEHAVIOR SKETCH
 * 1. If selection.selectedOccurrenceId === null, render the empty-state prompt.
 * 2. Otherwise look up the matching trace in diagnostics?.traces.
 * 3. Render header + numbered AllocationAttempt cards; highlight the chosen attempt.
 * 4. If the trace lookup is undefined, render a small notice (012 impl pending).
 */

import type { ScheduleDiagnostics, AllocationTrace, AllocationAttempt } from '@/lib/types';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

export interface AllocationTraceTabProps {
  selection: WorkspaceSelection;
  diagnostics?: ScheduleDiagnostics;
}

function AttemptCard({ attempt, index, isChosen }: { attempt: AllocationAttempt; index: number; isChosen: boolean }) {
  return (
    <article
      className={
        'border rounded p-3 text-sm ' +
        (isChosen ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-200')
      }
    >
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="font-mono text-gray-500">#{index + 1}</span>
        <span className="font-mono">{attempt.candidateActivityId}</span>
        {attempt.isPrimary ? (
          <span className="rounded bg-blue-100 text-blue-700 px-1">PRIMARY</span>
        ) : (
          <span className="rounded bg-amber-100 text-amber-700 px-1">BACKUP</span>
        )}
        {attempt.feasible ? (
          <span className="rounded bg-emerald-100 text-emerald-700 px-1">feasible: true</span>
        ) : (
          <span className="rounded bg-red-100 text-red-700 px-1">feasible: false</span>
        )}
        {isChosen && <span className="ml-auto rounded bg-emerald-600 text-white px-2">✓ chosen</span>}
      </div>
      {attempt.feasible ? (
        <div className="text-xs space-y-1">
          {attempt.boundResources.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {attempt.boundResources.map((b, i) => (
                <li key={i} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                  {b.role}: {b.id}
                </li>
              ))}
            </ul>
          )}
          <div className="text-gray-600">
            <span className="font-mono">isRemote: {attempt.isRemote ? 'true' : 'false'}</span>
            {attempt.location && (
              <span className="ml-2 font-mono">location: {attempt.location}</span>
            )}
          </div>
        </div>
      ) : (
        <ul className="space-y-1 text-xs">
          {attempt.failedConstraints.map((fc, i) => (
            <li key={i} className="flex items-center gap-1 flex-wrap">
              <span className="rounded bg-red-50 text-red-700 px-1 font-mono">{fc.kind}</span>
              {fc.role && (
                <span className="rounded bg-gray-100 text-gray-700 px-1 font-mono">{fc.role}</span>
              )}
              {fc.resourceId && (
                <span className="rounded bg-gray-100 text-gray-500 px-1 font-mono">{fc.resourceId}</span>
              )}
              <span className="text-gray-600">{fc.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function AllocationTraceTab({ selection, diagnostics }: AllocationTraceTabProps) {
  if (selection.selectedOccurrenceId === null) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Click an occurrence in the Calendar or Resources tab to see how it was allocated.
      </div>
    );
  }

  const trace: AllocationTrace | undefined = diagnostics?.traces.find(
    (t) => t.occurrenceId === selection.selectedOccurrenceId
  );

  if (!trace) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Trace not available (diagnostics not computed for this occurrence).
      </div>
    );
  }

  return (
    <div className="p-4 text-sm">
      <header className="mb-3">
        <h2 className="font-semibold font-mono text-sm">{trace.occurrenceId}</h2>
        <div className="text-xs text-gray-500">
          {trace.targetDate} · {trace.status}
        </div>
        <div className="text-xs text-gray-500">
          source: <span className="font-mono">{trace.sourceActivityId}</span>
        </div>
      </header>
      <ol className="space-y-2">
        {trace.attempts.map((attempt, i) => (
          <li key={i}>
            <AttemptCard
              attempt={attempt}
              index={i}
              isChosen={trace.chosenIndex !== null && i === trace.chosenIndex}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
