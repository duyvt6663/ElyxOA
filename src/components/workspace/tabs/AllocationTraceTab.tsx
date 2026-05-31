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

import type { Activity, ScheduleDiagnostics, ScheduleResult, ScheduledOccurrence, AllocationTrace, AllocationAttempt, ActivityEducationProfile } from '@/lib/types';
import { educationForOccurrence, educationForActivity, type EducationMap } from '@/lib/activity-education';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

export interface AllocationTraceTabProps {
  selection: WorkspaceSelection;
  diagnostics?: ScheduleDiagnostics;
  /** 016 §4 — source-activity definitions, for the details panel under short traces. */
  activities?: Activity[];
  /** 023 — schedule output, to resolve the selected occurrence + its status. */
  result: ScheduleResult;
  /** 023 — activity-education profiles keyed by activityId, for "About this action". */
  education: EducationMap;
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
        {attempt.policySource && (
          <span
            className="rounded bg-slate-100 text-slate-600 px-1"
            title="Provenance of the temporal policy used for this candidate"
          >
            policy: {attempt.policySource}
          </span>
        )}
        {isChosen && <span className="ml-auto rounded bg-emerald-600 text-white px-2">✓ chosen</span>}
      </div>
      {attempt.feasible ? (
        <div className="text-xs space-y-1">
          {attempt.candidateStartTime && (
            <div className="text-gray-700">
              <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-mono">
                {attempt.candidateDate} {attempt.candidateStartTime}–{attempt.candidateEndTime}
              </span>
              {typeof attempt.score === 'number' && (
                <span className="ml-2 font-mono text-gray-500">score {attempt.score}</span>
              )}
            </div>
          )}
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

export default function AllocationTraceTab({ selection, diagnostics, activities, result, education }: AllocationTraceTabProps) {
  if (selection.selectedOccurrenceId === null) {
    return (
      <div className="p-6 text-sm text-gray-600">
        <p className="mb-2 font-medium text-gray-700">See how any occurrence was allocated.</p>
        <ul className="list-disc space-y-1 pl-5 text-gray-500">
          <li>Click any action in the <span className="font-medium">Calendar</span> day timeline.</li>
          <li>Click any outcome bar in the <span className="font-medium">Activities</span> tab to jump to its most-adapted occurrence.</li>
          <li>Click a band in the <span className="font-medium">Resources</span> tab.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-400">
          The trace shows every candidate slot the scheduler tried, the chosen slot + score, the
          policy source, and why each rejected candidate failed.
        </p>
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

  const occ = result.occurrences.find((o) => o.id === selection.selectedOccurrenceId);
  const sourceOneLine = educationForActivity(education, trace.sourceActivityId)?.oneLine;

  return (
    <div className="p-4 text-sm" data-tour-id="trace-content">
      <header className="mb-3">
        <h2 className="font-semibold font-mono text-sm">{trace.occurrenceId}</h2>
        <div className="text-xs text-gray-500">
          {trace.targetDate} · {trace.status}
        </div>
        <div className="text-xs text-gray-500">
          source: <span className="font-mono">{trace.sourceActivityId}</span>
        </div>
        {sourceOneLine && <div className="mt-1 text-xs text-gray-400">{sourceOneLine}</div>}
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
      {occ && <AboutThisActionPanel occ={occ} trace={trace} education={education} />}
      <SourceActivityPanel activities={activities} sourceId={trace.sourceActivityId} />
    </div>
  );
}

/** 023 — health-education complement to SourceActivityPanel; handles scheduled/substituted/skipped. */
function AboutThisActionPanel({
  occ,
  trace,
  education,
}: {
  occ: ScheduledOccurrence;
  trace: AllocationTrace;
  education: EducationMap;
}) {
  if (occ.status === 'skipped') {
    const edu = educationForActivity(education, trace.sourceActivityId);
    if (!edu && !occ.reason) return null;
    return (
      <section className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
        <h3 className="mb-2 font-medium text-gray-700">About this action</h3>
        {edu ? (
          <EducationBody edu={edu} />
        ) : (
          <p className="text-gray-500">No education profile for this action.</p>
        )}
        {occ.reason && (
          <p className="mt-2 text-gray-600">
            <span className="font-medium text-gray-700">Not placed: </span>
            {occ.reason}
          </p>
        )}
      </section>
    );
  }

  if (occ.status === 'substituted') {
    const fallback = educationForOccurrence(education, occ);
    const originalTitle = occ.sourceTitle ?? educationForActivity(education, trace.sourceActivityId)?.oneLine;
    return (
      <section className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
        <h3 className="mb-2 font-medium text-gray-700">About this action</h3>
        <div className="mb-1 font-medium text-gray-700">Scheduled fallback</div>
        {fallback ? (
          <EducationBody edu={fallback} />
        ) : (
          <p className="text-gray-500">No education profile for the scheduled fallback.</p>
        )}
        <div className="mt-3 border-t border-gray-200 pt-2">
          <div className="mb-1 font-medium text-gray-700">Original plan</div>
          {originalTitle && <p className="text-gray-600">{originalTitle}</p>}
          {occ.reason && (
            <p className="mt-1 text-gray-600">
              <span className="font-medium text-gray-700">Why substituted: </span>
              {occ.reason}
            </p>
          )}
        </div>
      </section>
    );
  }

  // scheduled
  const edu = educationForOccurrence(education, occ);
  if (!edu) return null;
  return (
    <section className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
      <h3 className="mb-2 font-medium text-gray-700">About this action</h3>
      <EducationBody edu={edu} showGuidance />
    </section>
  );
}

/** 023 — shared education body (oneLine lead, what/why, healthFocus chips, optional member guidance). */
function EducationBody({ edu, showGuidance }: { edu: ActivityEducationProfile; showGuidance?: boolean }) {
  return (
    <div className="space-y-2 text-gray-600">
      <p className="text-gray-700">{edu.oneLine}</p>
      <p>
        <span className="font-medium text-gray-700">What it does: </span>
        {edu.whatItDoes}
      </p>
      <p>
        <span className="font-medium text-gray-700">Why it matters: </span>
        {edu.whyItMatters}
      </p>
      {edu.healthFocus.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {edu.healthFocus.map((f, i) => (
            <li key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
              {f}
            </li>
          ))}
        </ul>
      )}
      {showGuidance && edu.memberGuidance && (
        <p>
          <span className="font-medium text-gray-700">Member guidance: </span>
          {edu.memberGuidance}
        </p>
      )}
    </div>
  );
}

/** 016 §4 — source activity definition; fills the panel under short traces with useful context. */
function SourceActivityPanel({ activities, sourceId }: { activities?: Activity[]; sourceId: string }) {
  const a = activities?.find((x) => x.id === sourceId);
  if (!a) return null;
  const resources = a.resources.map((r) => `${r.kind}:${r.role}`).join(', ') || 'none';
  return (
    <section className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
      <h3 className="mb-2 font-medium text-gray-700">Source activity</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
        <div><dt className="inline text-gray-400">title: </dt><dd className="inline">{a.title}</dd></div>
        <div><dt className="inline text-gray-400">type: </dt><dd className="inline">{a.type}</dd></div>
        <div><dt className="inline text-gray-400">frequency: </dt><dd className="inline">{a.frequency.count}/{a.frequency.period}</dd></div>
        <div><dt className="inline text-gray-400">priority: </dt><dd className="inline">{a.priority}</dd></div>
        <div><dt className="inline text-gray-400">duration: </dt><dd className="inline">{a.durationMinutes}m</dd></div>
        <div><dt className="inline text-gray-400">remote: </dt><dd className="inline">{a.canBeRemote ? 'yes' : 'no'}</dd></div>
        <div className="col-span-2"><dt className="inline text-gray-400">resources: </dt><dd className="inline">{resources}</dd></div>
        <div className="col-span-2"><dt className="inline text-gray-400">backups: </dt><dd className="inline font-mono">{a.backupActivityIds.join(', ') || 'none'}</dd></div>
      </dl>
    </section>
  );
}
