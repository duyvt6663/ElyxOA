/**
 * DECISION RECAP — 017 Merge Actions + Priority into one "Activities" tab
 * - One row per primary activity. ONE sort-only view (no display modes); sort modes:
 *   Priority (default) · Type (fixed domain order) · Outcome (most adapted first) · Frequency.
 *   Every sort tie-breaks by priority asc then activity.id asc (deterministic).
 * - Row = priority · type · title · outcome bar + S·B·X + off-window · resources.
 * - Explicit hit targets (no whole-row onClick): chevron/title → expand; outcome button → the
 *   REPRESENTATIVE occurrence's Trace (skipped → substituted → off-window → scheduled); each
 *   occurrence in the expansion → its Trace.
 * - Desktop: sticky-header table. Mobile (<md): stacked cards (priority·type·title / outcome line;
 *   resources + definition metadata only in the expansion).
 * - Read-only (no edit); 102 primary rows need no virtualization.
 */

import { Fragment, useMemo, useState } from 'react';
import type { Activity, ActivityType, ScheduleResult, ScheduledOccurrence } from '@/lib/types';
import { educationForActivity, type EducationMap } from '@/lib/activity-education';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

type SortMode = 'priority' | 'type' | 'outcome' | 'frequency';

export interface ActivitiesTabProps {
  activities: Activity[];
  result: ScheduleResult;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
  education: EducationMap;
}

const TYPE_TAG: Record<ActivityType, string> = {
  fitness: 'bg-indigo-100 text-indigo-700',
  food: 'bg-lime-100 text-lime-700',
  medication: 'bg-rose-100 text-rose-700',
  therapy: 'bg-violet-100 text-violet-700',
  consultation: 'bg-sky-100 text-sky-700',
};

const STATUS_TAG: Record<'scheduled' | 'substituted' | 'skipped', string> = {
  scheduled: 'bg-emerald-100 text-emerald-700',
  substituted: 'bg-amber-100 text-amber-700',
  skipped: 'bg-gray-200 text-gray-700',
};

const PERIOD_WEIGHT = { day: 365, week: 52, month: 12, year: 1 } as const;
const TYPE_ORDER: ActivityType[] = ['consultation', 'therapy', 'fitness', 'food', 'medication'];

interface Outcome {
  s: number;
  b: number;
  x: number;
  off: number;
}
const EMPTY_OUTCOME: Outcome = { s: 0, b: 0, x: 0, off: 0 };

function summarizeResources(a: Activity): string {
  const byRole: Record<string, number> = {};
  for (const r of a.resources) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
  const parts = Object.entries(byRole).map(([role, n]) => `${role} × ${n}`);
  return parts.length === 0 ? '—' : parts.join(', ');
}

/** 017 #4 — the most explainable occurrence to open in Trace, not the chronological first. */
function representativeOcc(occs: ScheduledOccurrence[]): ScheduledOccurrence | null {
  return (
    occs.find((o) => o.status === 'skipped') ??
    occs.find((o) => o.status === 'substituted') ??
    occs.find((o) => o.outsidePreferredWindow) ??
    occs.find((o) => o.status === 'scheduled') ??
    occs[0] ??
    null
  );
}

function OutcomeBar({ o }: { o: Outcome }) {
  const total = o.s + o.b + o.x;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return (
    <div className="flex h-2 w-28 overflow-hidden rounded bg-gray-100">
      <div className="h-full bg-emerald-500" style={{ width: pct(o.s) + '%' }} />
      <div className="h-full bg-amber-500" style={{ width: pct(o.b) + '%' }} />
      <div className="h-full bg-gray-400" style={{ width: pct(o.x) + '%' }} />
    </div>
  );
}

function OutcomeCounts({ o }: { o: Outcome }) {
  return (
    <span className="font-mono whitespace-nowrap text-[11px]">
      <span className="text-emerald-700">S {o.s}</span> · <span className="text-amber-700">B {o.b}</span> ·{' '}
      <span className="text-gray-500">X {o.x}</span>
      {o.off > 0 && <span className="ml-1 text-amber-600">{o.off} off-win</span>}
    </span>
  );
}

export default function ActivitiesTab({ activities, result, selection: _selection, onSelect, education }: ActivitiesTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const occByActivity = useMemo(() => {
    const m = new Map<string, ScheduledOccurrence[]>();
    for (const occ of result.occurrences) {
      const list = m.get(occ.sourceActivityId);
      if (list) list.push(occ);
      else m.set(occ.sourceActivityId, [occ]);
    }
    return m;
  }, [result]);

  const outcome = useMemo(() => {
    const m = new Map<string, Outcome>();
    for (const occ of result.occurrences) {
      const c = m.get(occ.sourceActivityId) ?? { s: 0, b: 0, x: 0, off: 0 };
      if (occ.status === 'scheduled') c.s += 1;
      else if (occ.status === 'substituted') c.b += 1;
      else c.x += 1;
      if (occ.outsidePreferredWindow) c.off += 1;
      m.set(occ.sourceActivityId, c);
    }
    return m;
  }, [result]);

  const rows = useMemo(() => {
    const primary = activities.filter((a) => !a.isBackupOnly);
    const tie = (a: Activity, b: Activity) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const cmp: Record<SortMode, (a: Activity, b: Activity) => number> = {
      priority: (a, b) => a.priority - b.priority || tie(a, b),
      type: (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || tie(a, b),
      outcome: (a, b) => {
        const oa = outcome.get(a.id) ?? EMPTY_OUTCOME;
        const ob = outcome.get(b.id) ?? EMPTY_OUTCOME;
        return ob.x - oa.x || ob.b - oa.b || ob.off - oa.off || tie(a, b);
      },
      frequency: (a, b) =>
        b.frequency.count * PERIOD_WEIGHT[b.frequency.period] - a.frequency.count * PERIOD_WEIGHT[a.frequency.period] ||
        tie(a, b),
    };
    return [...primary].sort(cmp[sortMode]);
  }, [activities, sortMode, outcome]);

  const openTrace = (id: string) => {
    const o = representativeOcc(occByActivity.get(id) ?? []);
    if (o) onSelect({ selectedOccurrenceId: o.id, selectedDate: o.date, activeTab: 'trace' });
  };
  const openOcc = (occ: ScheduledOccurrence) =>
    onSelect({ selectedOccurrenceId: occ.id, selectedDate: occ.date, activeTab: 'trace' });
  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  function ExpandContent({ a }: { a: Activity }) {
    const occs = occByActivity.get(a.id) ?? [];
    const edu = educationForActivity(education, a.id);
    return (
      <>
        <div className="mb-2 rounded bg-white/60 p-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Health context</div>
          {edu ? (
            <div className="space-y-1 text-[11px] text-gray-700">
              <div>
                <span className="text-gray-500">What it does: </span>
                {edu.whatItDoes}
              </div>
              <div>
                <span className="text-gray-500">Why it matters: </span>
                {edu.whyItMatters}
              </div>
              {edu.healthFocus.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-gray-500">Health focus:</span>
                  {edu.healthFocus.map((f) => (
                    <span key={f} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {edu.expectedSignals.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-gray-500">Signals to watch:</span>
                  {edu.expectedSignals.map((s) => (
                    <span key={s} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <span className="text-gray-500">Member guidance: </span>
                {edu.memberGuidance}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-gray-700">{a.details}</p>
          )}
        </div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span>resources: {summarizeResources(a)}</span>
          <span>facilitator: {a.facilitatorLabel}</span>
          <span>locations: {a.locations.join(', ')}</span>
          <span>remote: {a.canBeRemote ? 'yes' : 'no'}</span>
          <span>prep: {a.prep.length}</span>
          <span>backups: {a.backupActivityIds.length}</span>
        </div>
        <div className="mb-1 text-[11px] text-gray-500">
          {occs.length} occurrence{occs.length === 1 ? '' : 's'}
        </div>
        <ul className="space-y-1">
          {occs.map((occ) => (
            <li key={occ.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white"
                onClick={() => openOcc(occ)}
              >
                <span className="font-mono text-[11px]">{occ.date}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TAG[occ.status]}`}>{occ.status}</span>
                <span className="truncate text-[11px] text-gray-500">{occ.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Activities ({rows.length})</h2>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Sort</span>
          <select
            className="rounded border px-2 py-1 text-xs"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="priority">Priority</option>
            <option value="type">Type</option>
            <option value="outcome">Outcome (most adapted)</option>
            <option value="frequency">Frequency</option>
          </select>
        </label>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        Outcome bar = scheduled / substituted / skipped. Click the outcome to trace the most-adapted
        occurrence; expand a row for all occurrences + details.
      </p>

      {/* Desktop: sticky-header table */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 border-b bg-white text-left text-gray-500">
            <tr>
              <th className="w-6 py-2" />
              <th className="py-2 pr-2">pri</th>
              <th className="py-2 pr-2">type</th>
              <th className="py-2 pr-2 min-w-48">title</th>
              <th className="py-2 pr-2">freq</th>
              <th className="py-2 pr-2 whitespace-nowrap">outcome</th>
              <th className="py-2 pr-2">resources</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const expanded = expandedId === a.id;
              const o = outcome.get(a.id) ?? EMPTY_OUTCOME;
              return (
                <Fragment key={a.id}>
                  <tr className="border-b">
                    <td className="py-2 align-top">
                      <button type="button" aria-label="Expand" onClick={() => toggle(a.id)} className="text-gray-400 hover:text-gray-700">
                        {expanded ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="py-2 pr-2 font-mono align-top">{a.priority}</td>
                    <td className="py-2 pr-2 align-top">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_TAG[a.type]}`}>{a.type}</span>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <button type="button" onClick={() => toggle(a.id)} className="text-left font-medium hover:underline">
                        {a.title}
                      </button>
                      {educationForActivity(education, a.id)?.oneLine && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">
                          {educationForActivity(education, a.id)?.oneLine}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap align-top">
                      {a.frequency.count}/{a.frequency.period}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <button
                        type="button"
                        onClick={() => openTrace(a.id)}
                        title="Trace the most-adapted occurrence"
                        className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-100"
                      >
                        <OutcomeBar o={o} />
                        <OutcomeCounts o={o} />
                      </button>
                    </td>
                    <td className="py-2 pr-2 align-top">{summarizeResources(a)}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={7} className="p-3">
                        <ExpandContent a={a} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((a) => {
          const expanded = expandedId === a.id;
          const o = outcome.get(a.id) ?? EMPTY_OUTCOME;
          return (
            <div key={a.id} className="rounded border border-gray-200">
              <div className="flex flex-col gap-1 p-2">
                <button type="button" onClick={() => toggle(a.id)} className="flex items-center gap-2 text-left">
                  <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                  <span className="font-mono text-xs text-gray-500">#{a.priority}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_TAG[a.type]}`}>{a.type}</span>
                  <span className="flex-1 truncate font-medium">{a.title}</span>
                </button>
                {educationForActivity(education, a.id)?.oneLine && (
                  <div className="line-clamp-2 pl-6 text-[11px] text-gray-500">
                    {educationForActivity(education, a.id)?.oneLine}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openTrace(a.id)}
                  className="flex items-center gap-2 self-start rounded px-1 py-0.5 hover:bg-gray-100"
                >
                  <OutcomeBar o={o} />
                  <OutcomeCounts o={o} />
                </button>
              </div>
              {expanded && (
                <div className="border-t border-gray-200 p-2">
                  <ExpandContent a={a} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
