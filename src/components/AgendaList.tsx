'use client';

/**
 * DECISION RECAP — 006 Render Calendar Output + 016 §9 mobile density
 * - Mobile fallback for MonthGrid. 016 §9: rendering an OccurrenceCard per occurrence is
 *   ~1189 cards for one month at temporal scale — unusable. Instead render one compact
 *   SUMMARY ROW per day (date + per-type count pills with ⟳/✕ adaptation badges, mirroring
 *   DayCell), and tap a day to expand its DayTimeline inline. Drill into one day, not 1189 cards.
 */

import { useState } from 'react';
import type { ScheduledOccurrence, ActivityType, MemberBusyBlock, TravelPlan } from '@/lib/types';
import DayTimeline from './DayTimeline';
import { travelForDate, TravelBadge } from './travelMarker';
import GlossaryTooltip from './GlossaryTooltip';

export interface AgendaListProps {
  occurrences: ScheduledOccurrence[];
  onSelect?: (occurrence: ScheduledOccurrence) => void;
  /** (010 #6) Optional month filter; when set, only occurrences in that month show. */
  month?: 'Jun' | 'Jul' | 'Aug';
  /** 015 — member occupied blocks for the expanded day timeline. */
  memberBusy?: MemberBusyBlock[];
  /** 019 follow-up — travel windows, to flag trip days. */
  travel?: TravelPlan[];
  /** home IANA tz, for the travel badge's offset annotation. */
  homeTimeZone?: string;
}

const MONTH_PREFIX: Record<'Jun' | 'Jul' | 'Aug', string> = {
  Jun: '2026-06-',
  Jul: '2026-07-',
  Aug: '2026-08-',
};

const TYPE_SUMMARY: Record<ActivityType, { label: string; cls: string }> = {
  fitness: { label: 'Fitness', cls: 'bg-indigo-100 text-indigo-800' },
  food: { label: 'Food', cls: 'bg-lime-100 text-lime-800' },
  medication: { label: 'Meds', cls: 'bg-rose-100 text-rose-800' },
  therapy: { label: 'Therapy', cls: 'bg-violet-100 text-violet-800' },
  consultation: { label: 'Consult', cls: 'bg-sky-100 text-sky-800' },
};
const TYPE_ORDER: ActivityType[] = ['consultation', 'therapy', 'fitness', 'food', 'medication'];

interface Tally {
  happening: number;
  substituted: number;
  skipped: number;
}

export default function AgendaList({ occurrences, onSelect, month, memberBusy = [], travel, homeTimeZone }: AgendaListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = month ? occurrences.filter((o) => o.date.startsWith(MONTH_PREFIX[month])) : occurrences;

  if (filtered.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 text-center">
        No occurrences match current filters.
      </div>
    );
  }

  const byDate = new Map<string, ScheduledOccurrence[]>();
  for (const o of filtered) {
    const arr = byDate.get(o.date) ?? [];
    arr.push(o);
    byDate.set(o.date, arr);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <section className="flex flex-col gap-2">
      {dates.map((date) => {
        const occs = byDate.get(date)!;
        const byType = new Map<ActivityType, Tally>();
        for (const o of occs) {
          const t = byType.get(o.type) ?? { happening: 0, substituted: 0, skipped: 0 };
          if (o.status === 'skipped') t.skipped += 1;
          else {
            t.happening += 1;
            if (o.status === 'substituted') t.substituted += 1;
          }
          byType.set(o.type, t);
        }
        const pills = TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, ...byType.get(t)! }));
        const isOpen = expanded === date;
        return (
          <div key={date} className="rounded border border-gray-200">
            <button
              type="button"
              onClick={() => setExpanded((p) => (p === date ? null : date))}
              className="flex w-full flex-wrap items-center gap-1.5 p-2 text-left"
            >
              <span className="mr-1 text-xs font-medium text-gray-700">{date}</span>
              {(() => {
                const trip = travelForDate(travel, date);
                return trip ? <TravelBadge trip={trip} date={date} homeTimeZone={homeTimeZone} /> : null;
              })()}
              {pills.map((p) => {
                const meta = TYPE_SUMMARY[p.type];
                return (
                  <span key={p.type} className={`rounded px-1.5 py-0.5 text-[10px] ${meta.cls}`}>
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
              <span className="ml-auto text-xs text-gray-400">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-200 p-2">
                <DayTimeline date={date} occurrences={occs} memberBusy={memberBusy} showOccupied onSelect={onSelect} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
