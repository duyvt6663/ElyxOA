/**
 * DECISION RECAP — 013 Priority Queue Tab
 * - List of `activities` sorted strictly by `priority` ascending.
 * - Each row carries a small horizontal stacked bar showing per-activity outcome counts
 *   (scheduled / substituted / skipped) computed from `result.occurrences`.
 * - Row click → `onSelect({ selectedOccurrenceId: <first occurrence id for this activity>,
 *   activeTab: 'trace' })` so the user jumps straight into the trace for the first
 *   instance. Impl pass decides between "first occurrence" vs "first SKIPPED/SUBSTITUTED
 *   occurrence" (the latter is more useful for the explainability flow).
 * - Open Question §2 (013 plan) may merge this with ActionListTab into a single
 *   "Activities" tab with a sort toggle. SCAFFOLD keeps them separate.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - 011 stub. Real content lands in 013.
 * - Props declared in full so 013 has a concrete target.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Compute per-activity outcome counts from result.occurrences.
 * 2. Render rows sorted by priority asc: [priority, title, type tag, stacked bar].
 * 3. Row click → jump to Trace tab with that activity's first occurrence selected.
 */

import { useMemo } from 'react';
import type { Activity, ActivityType, ScheduleResult } from '@/lib/types';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

export interface PriorityQueueTabProps {
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

interface Counts {
  scheduled: number;
  substituted: number;
  skipped: number;
  /** 015 — timed occurrences placed outside the activity's preferred window. */
  offWindow: number;
  firstOccId: string | null;
}

export default function PriorityQueueTab({ activities, result, selection: _selection, onSelect }: PriorityQueueTabProps) {
  const sorted = useMemo(
    () => activities.filter((a) => !a.isBackupOnly).sort((a, b) => a.priority - b.priority),
    [activities]
  );

  const counts = useMemo(() => {
    const m = new Map<string, Counts>();
    for (const occ of result.occurrences) {
      const c = m.get(occ.sourceActivityId) ?? {
        scheduled: 0,
        substituted: 0,
        skipped: 0,
        offWindow: 0,
        firstOccId: null,
      };
      c[occ.status] += 1;
      // Read the scheduler-emitted flag — do NOT rederive policy semantics in the UI
      // (the scheduler accounts for hint policies + anchor allowance, which the UI cannot).
      if (occ.outsidePreferredWindow) c.offWindow += 1;
      if (c.firstOccId === null) c.firstOccId = occ.id;
      m.set(occ.sourceActivityId, c);
    }
    return m;
  }, [result]);

  function onRowClick(activityId: string) {
    const c = counts.get(activityId);
    onSelect({
      selectedOccurrenceId: c?.firstOccId ?? null,
      activeTab: 'trace',
    });
  }

  return (
    <div className="p-4 text-sm">
      <h2 className="font-medium">Activities by Priority</h2>
      <p className="text-xs text-gray-500 mb-3">scheduled / substituted / skipped · off-window = placed outside preferred time</p>
      <ul className="space-y-1">
        {sorted.map((a) => {
          const c = counts.get(a.id) ?? { scheduled: 0, substituted: 0, skipped: 0, offWindow: 0, firstOccId: null };
          const total = c.scheduled + c.substituted + c.skipped;
          const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
          return (
            <li
              key={a.id}
              className="flex items-center gap-3 border rounded p-2 hover:bg-gray-50 cursor-pointer"
              onClick={() => onRowClick(a.id)}
            >
              <span className="font-mono text-xs w-10 text-right text-gray-500">#{a.priority}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${TYPE_TAG[a.type]}`}>{a.type}</span>
              <span className="flex-1 truncate">{a.title}</span>
              <div className="flex h-2 w-32 overflow-hidden rounded bg-gray-100">
                <div className="h-full bg-emerald-500" style={{ width: pct(c.scheduled) + '%' }} />
                <div className="h-full bg-amber-500" style={{ width: pct(c.substituted) + '%' }} />
                <div className="h-full bg-gray-400" style={{ width: pct(c.skipped) + '%' }} />
              </div>
              <span className="font-mono text-[11px] text-gray-600 w-28 text-right whitespace-nowrap">
                S {c.scheduled} · B {c.substituted} · X {c.skipped}
              </span>
              <span
                className="font-mono text-[11px] w-20 text-right whitespace-nowrap text-amber-600"
                title="timed occurrences placed outside the preferred window"
              >
                {c.offWindow > 0 ? `${c.offWindow} off-win` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
