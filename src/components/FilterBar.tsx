/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Three toggle groups: month switcher (Jun/Jul/Aug), status toggles, type toggles.
 * - Pure controlled component: parent (CalendarView) owns the state.
 * - Tailwind utility classes for layout.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render month buttons; active month gets a pressed-style class.
 * 2. Render status toggle buttons; active filters get a pressed-style class.
 * 3. Render type toggle buttons; active filters get a pressed-style class.
 * 4. Click handlers delegate to the prop callbacks (no internal state).
 */

import type { ActivityType, ScheduledOccurrence } from '@/lib/types';

type Month = 'Jun' | 'Jul' | 'Aug';
type Status = ScheduledOccurrence['status'];

export interface FilterBarProps {
  month: Month;
  onMonthChange: (m: Month) => void;
  statusFilters: Set<Status>;
  onStatusToggle: (s: Status) => void;
  typeFilters: Set<ActivityType>;
  onTypeToggle: (t: ActivityType) => void;
  /** (010 #12) Optional reset link; restores all filters to "all on". */
  onReset?: () => void;
}

const STATUSES: ReadonlyArray<ScheduledOccurrence['status']> = ['scheduled', 'substituted', 'skipped'] as const;
const ACTIVITY_TYPES: ReadonlyArray<ActivityType> = ['fitness', 'food', 'medication', 'therapy', 'consultation'] as const;
const MONTHS = ['Jun', 'Jul', 'Aug'] as const;

const STATUS_ACTIVE: Record<Status, string> = {
  scheduled: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  substituted: 'bg-amber-100 text-amber-800 border-amber-200',
  skipped: 'bg-gray-100 text-gray-700 border-gray-200',
};

const TYPE_ACTIVE: Record<ActivityType, string> = {
  fitness: 'bg-indigo-100 text-indigo-800',
  food: 'bg-lime-100 text-lime-800',
  medication: 'bg-rose-100 text-rose-800',
  therapy: 'bg-violet-100 text-violet-800',
  consultation: 'bg-sky-100 text-sky-800',
};

export default function FilterBar({
  month,
  onMonthChange,
  statusFilters,
  onStatusToggle,
  typeFilters,
  onTypeToggle,
  onReset,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1" aria-label="Month">
        {MONTHS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMonthChange(m)}
            className={`px-3 py-1 rounded text-sm ${m === month ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1" aria-label="Status filters">
        {STATUSES.map((s) => {
          const active = statusFilters.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onStatusToggle(s)}
              aria-pressed={active}
              className={`px-2 py-0.5 rounded border text-xs ${active ? STATUS_ACTIVE[s] : 'bg-white text-gray-500 border-gray-200'}`}
            >
              {capitalize(s)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 flex-wrap" aria-label="Type filters">
        {ACTIVITY_TYPES.map((t) => {
          const active = typeFilters.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTypeToggle(t)}
              aria-pressed={active}
              className={`px-2 py-0.5 rounded text-xs ${active ? TYPE_ACTIVE[t] : 'bg-white text-gray-500'}`}
            >
              {capitalize(t)}
            </button>
          );
        })}
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-xs text-blue-600 hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
