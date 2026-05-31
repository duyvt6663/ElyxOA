/**
 * DECISION RECAP — 006 Render Calendar Output + 015 month-overview density
 * - At temporal scale a day has dozens of occurrences and (under a packed member calendar)
 *   many substitutions/skips. Rendering them as individual chips floods the cell, so the
 *   month overview shows ONE compact pill PER ActivityType with counts:
 *       "{Type} {happening}"  + ⟳{substituted}  + ✕{skipped}
 *   where happening = scheduled + substituted. At most 5 pills -> always <= 8 chip nodes.
 * - Any pill click expands the inline DayDetail timeline (per-occurrence detail lives there).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render the day number.
 * 2. Tally per-type {happening = scheduled+substituted, substituted, skipped}.
 * 3. Render one type-colored pill per present type, in a stable type order, with ⟳/✕ badges.
 * 4. Pill click -> onExpand(date) opens the DayDetail timeline.
 */

import type { ScheduledOccurrence, ActivityType, TravelPlan } from '@/lib/types';
import { travelDestinationForDate, TravelBadge } from './travelMarker';
import GlossaryTooltip from './GlossaryTooltip';

export interface DayCellProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  expanded?: boolean;
  onExpand?: (date: string) => void;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
  /** 019 follow-up — travel windows, to flag trip days on the month grid. */
  travel?: TravelPlan[];
}

const TYPE_SUMMARY: Record<ActivityType, { label: string; cls: string }> = {
  fitness: { label: 'Fitness', cls: 'bg-indigo-100 text-indigo-800' },
  food: { label: 'Food', cls: 'bg-lime-100 text-lime-800' },
  medication: { label: 'Meds', cls: 'bg-rose-100 text-rose-800' },
  therapy: { label: 'Therapy', cls: 'bg-violet-100 text-violet-800' },
  consultation: { label: 'Consult', cls: 'bg-sky-100 text-sky-800' },
};

// Most adaptation-relevant first (consultations/therapy carry the engineered skips).
const TYPE_ORDER: ActivityType[] = ['consultation', 'therapy', 'fitness', 'food', 'medication'];

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

interface Tally {
  happening: number; // scheduled + substituted
  substituted: number;
  skipped: number;
}

export default function DayCell({ date, occurrences, expanded, onExpand, travel }: DayCellProps) {
  const tripDestination = travelDestinationForDate(travel, date);
  const byType = new Map<ActivityType, Tally>();
  for (const o of occurrences) {
    const t = byType.get(o.type) ?? { happening: 0, substituted: 0, skipped: 0 };
    if (o.status === 'skipped') t.skipped += 1;
    else {
      t.happening += 1;
      if (o.status === 'substituted') t.substituted += 1;
    }
    byType.set(o.type, t);
  }
  const pills = TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, ...byType.get(t)! }));

  return (
    <button
      type="button"
      onClick={() => onExpand?.(date)}
      className={`bg-white p-2 min-h-24 flex flex-col gap-1 text-left w-full ${expanded ? 'ring-2 ring-blue-400' : ''} hover:bg-gray-50`}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-gray-700">{parseYMD(date).d}</span>
        {tripDestination && <TravelBadge destination={tripDestination} className="ml-auto" />}
      </div>
      <div data-testid="day-cell-chips" className="flex flex-col gap-1">
        {pills.map((p) => {
          const meta = TYPE_SUMMARY[p.type];
          return (
            <span
              key={p.type}
              className={`self-start rounded px-1.5 py-0.5 text-[10px] ${meta.cls}`}
              title={`${meta.label}: ${p.happening} scheduled${p.substituted ? `, ${p.substituted} substituted` : ''}${p.skipped ? `, ${p.skipped} skipped` : ''}`}
            >
              {meta.label} {p.happening}
              {p.substituted > 0 && (
                <GlossaryTooltip term="statusGlyph.B">
                  <span className="ml-1 font-semibold text-amber-700">B{p.substituted}</span>
                </GlossaryTooltip>
              )}
              {p.skipped > 0 && (
                <GlossaryTooltip term="statusGlyph.X">
                  <span className="ml-1 font-semibold text-gray-500">X{p.skipped}</span>
                </GlossaryTooltip>
              )}
            </span>
          );
        })}
      </div>
    </button>
  );
}
