/**
 * DECISION RECAP — 013 Action List Tab
 * - Read-only table over `activities`. No create/edit; 013 is explicitly explainability.
 * - Default sort: group-by-type. Secondary sort options: frequency, remote-eligibility.
 * - Columns mirror the canonical Activity shape: id, title, type (color tag), frequency
 *   (`count/period`), priority, facilitator, locations, canBeRemote, prep summary,
 *   resources summary (`role × N`), backup chain length.
 * - Open Question §2 (013 plan) suggests collapsing this with PriorityQueueTab into a
 *   single "Activities" tab with a sort toggle. SCAFFOLD keeps them separate; impl
 *   pass may merge after a final UX call.
 * - Row click expands inline: shows every occurrence of that activity (date + status).
 *   Clicking any occurrence row jumps to the Trace tab with that occurrence selected.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - 011 stub. Real content lands in 013.
 * - Props declared in full so 013 has a concrete target.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render header row with sort selector (group-by-type | sort-by-frequency | sort-by-remote-eligibility).
 * 2. Render the activities table below with the canonical column set.
 * 3. Rows expand on click to show all occurrences; occurrence click → Trace tab via onSelect.
 */

import { Fragment, useMemo, useState } from 'react';
import type { Activity, ActivityType, ScheduleResult } from '@/lib/types';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

type SortMode = 'group-by-type' | 'sort-by-frequency' | 'sort-by-remote';

export interface ActionListTabProps {
  activities: Activity[];
  result: ScheduleResult;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
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

function summarizeResources(a: Activity): string {
  const byRole: Record<string, number> = {};
  for (const r of a.resources) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
  const parts = Object.entries(byRole).map(([role, n]) => `${role} × ${n}`);
  return parts.length === 0 ? '—' : parts.join(', ');
}

export default function ActionListTab({ activities, result, selection: _selection, onSelect }: ActionListTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>('group-by-type');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const primary = activities.filter((a) => !a.isBackupOnly);
    if (sortMode === 'group-by-type') {
      return [...primary].sort((a, b) =>
        a.type === b.type ? a.priority - b.priority : a.type.localeCompare(b.type)
      );
    }
    if (sortMode === 'sort-by-frequency') {
      return [...primary].sort((a, b) => {
        const wa = a.frequency.count * PERIOD_WEIGHT[a.frequency.period];
        const wb = b.frequency.count * PERIOD_WEIGHT[b.frequency.period];
        return wb - wa;
      });
    }
    // sort-by-remote: canBeRemote first, then by priority
    return [...primary].sort((a, b) => {
      if (a.canBeRemote !== b.canBeRemote) return a.canBeRemote ? -1 : 1;
      return a.priority - b.priority;
    });
  }, [activities, sortMode]);

  // Index occurrences by sourceActivityId for fast lookup.
  const occByActivity = useMemo(() => {
    const m = new Map<string, ScheduleResult['occurrences']>();
    for (const occ of result.occurrences) {
      const list = m.get(occ.sourceActivityId);
      if (list) list.push(occ);
      else m.set(occ.sourceActivityId, [occ]);
    }
    return m;
  }, [result]);

  // 016 §E: per-activity scheduling outcome so the table connects to the schedule.
  const outcome = useMemo(() => {
    const m = new Map<string, { s: number; b: number; x: number }>();
    for (const occ of result.occurrences) {
      const c = m.get(occ.sourceActivityId) ?? { s: 0, b: 0, x: 0 };
      if (occ.status === 'scheduled') c.s += 1;
      else if (occ.status === 'substituted') c.b += 1;
      else c.x += 1;
      m.set(occ.sourceActivityId, c);
    }
    return m;
  }, [result]);

  return (
    <div className="p-4 text-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Activities ({rows.length})</h2>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Sort</span>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="group-by-type">Group by type</option>
            <option value="sort-by-frequency">Sort by frequency</option>
            <option value="sort-by-remote">Sort by remote-eligibility</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500 mb-2">Row → expand occurrences; outcome S scheduled · B substituted · X skipped. Click an occurrence for its Trace.</p>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-white text-left text-gray-500 border-b">
          <tr>
            <th className="py-2 pr-2 font-mono">id</th>
            <th className="py-2 pr-2 min-w-48">title</th>
            <th className="py-2 pr-2">type</th>
            <th className="py-2 pr-2">freq</th>
            <th className="py-2 pr-2">pri</th>
            <th className="py-2 pr-2">resources</th>
            <th className="py-2 pr-2 whitespace-nowrap">outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const expanded = expandedId === a.id;
            const occs = occByActivity.get(a.id) ?? [];
            const o = outcome.get(a.id) ?? { s: 0, b: 0, x: 0 };
            return (
              <Fragment key={a.id}>
                <tr
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  <td className="py-2 pr-2 font-mono text-gray-400">{a.id}</td>
                  <td className="py-2 pr-2 font-medium">{a.title}</td>
                  <td className="py-2 pr-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_TAG[a.type]}`}>{a.type}</span>
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {a.frequency.count}/{a.frequency.period}
                  </td>
                  <td className="py-2 pr-2 font-mono">{a.priority}</td>
                  <td className="py-2 pr-2">{summarizeResources(a)}</td>
                  <td className="py-2 pr-2 font-mono whitespace-nowrap">
                    <span className="text-emerald-700">S {o.s}</span>{' · '}
                    <span className="text-amber-700">B {o.b}</span>{' · '}
                    <span className="text-gray-500">X {o.x}</span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-gray-50">
                    <td colSpan={7} className="p-3">
                      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                        <span>facilitator: {a.facilitatorLabel}</span>
                        <span>locations: {a.locations.join(', ')}</span>
                        <span>remote: {a.canBeRemote ? 'yes' : 'no'}</span>
                        <span>prep: {a.prep.length}</span>
                        <span>backups: {a.backupActivityIds.length}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mb-1">
                        {occs.length} occurrence{occs.length === 1 ? '' : 's'}
                      </div>
                      <ul className="space-y-1">
                        {occs.map((occ) => (
                          <li key={occ.id}>
                            <button
                              type="button"
                              className="flex items-center gap-2 w-full text-left hover:bg-white rounded px-2 py-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect({
                                  selectedOccurrenceId: occ.id,
                                  selectedDate: occ.date,
                                  activeTab: 'trace',
                                });
                              }}
                            >
                              <span className="font-mono text-[11px]">{occ.date}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_TAG[occ.status]}`}>
                                {occ.status}
                              </span>
                              <span className="text-[11px] text-gray-500 truncate">{occ.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
