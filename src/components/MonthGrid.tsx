'use client';

/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Hand-rolled 7-col Tailwind grid (no calendar lib).
 * - Week starts Monday (locked default).
 * - Visible month only (Jun / Jul / Aug 2026); switcher lives in FilterBar.
 * - DayCell caps at ~3 chips; "+N more" expands inline to DayDetail (no modal).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Compute first-weekday-of-month and day-count for the visible month.
 * 2. Render leading blank cells so day 1 aligns under its Monday-start weekday.
 * 3. For each day in the month, group occurrences by ISO date and render a DayCell.
 * 4. Track which date is expanded; render DayDetail inline beneath the row when set.
 * 5. (010 #8) When the parent passes zero occurrences, render a dashed empty-state
 *    notice ABOVE the weekday header so the grid layout stays intact below it.
 */

import { useEffect, useRef, useState } from 'react';
import type { ScheduledOccurrence, MemberBusyBlock, TravelPlan } from '@/lib/types';
import DayCell from './DayCell';
import DayDetail from './DayDetail';

export interface MonthGridProps {
  occurrences: ScheduledOccurrence[];
  month: 'Jun' | 'Jul' | 'Aug';
  year: 2026;
  /** 015 — member occupied blocks, passed to DayDetail's timeline. */
  memberBusy?: MemberBusyBlock[];
  /** 019 follow-up — travel windows, to flag trip days on the grid. */
  travel?: TravelPlan[];
  /** home IANA tz, for the travel badge offset annotation. */
  homeTimeZone?: string;
  onSelect?: (occurrence: ScheduledOccurrence) => void;
  /** 019 — fired with the date when a day is expanded (not when collapsed). */
  onExpandDay?: (date: string) => void;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_INDEX = { Jun: 6, Jul: 7, Aug: 8 } as const;
const MONTH_DAYS = { Jun: 30, Jul: 31, Aug: 31 } as const;

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}
function formatYMD(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}
function weekdayOfYMD(s: string): number {
  const { y, m, d } = parseYMD(s);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export default function MonthGrid({ occurrences, month, year, memberBusy = [], travel, homeTimeZone, onSelect, onExpandDay }: MonthGridProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  // The DayDetail aside renders BELOW the grid, often off-screen. Scroll it
  // into view when expandedDate changes so clicking "+N more" is visibly responsive.
  useEffect(() => {
    if (expandedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [expandedDate]);

  const monthNum = MONTH_INDEX[month];
  const daysInMonth = MONTH_DAYS[month];
  const firstDateStr = formatYMD(year, monthNum, 1);
  const leadingBlanks = weekdayOfYMD(firstDateStr) - 1;
  const dayDates: string[] = [...Array(daysInMonth).keys()].map((i) =>
    formatYMD(year, monthNum, i + 1),
  );

  const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}-`;
  const byDate = new Map<string, ScheduledOccurrence[]>();
  for (const o of occurrences) {
    if (o.date.startsWith(monthPrefix)) {
      const arr = byDate.get(o.date) ?? [];
      arr.push(o);
      byDate.set(o.date, arr);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {occurrences.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 text-center">
          No occurrences match current filters.
        </div>
      )}
      <div className="grid grid-cols-7 gap-px text-xs font-medium text-gray-500">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="px-2 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="bg-gray-50 min-h-24" />
        ))}
        {dayDates.map((date) => (
          <DayCell
            key={date}
            date={date}
            occurrences={byDate.get(date) ?? []}
            travel={travel}
            homeTimeZone={homeTimeZone}
            expanded={expandedDate === date}
            onExpand={(d) => {
              setExpandedDate((prev) => (prev === d ? null : d));
              if (expandedDate !== d) onExpandDay?.(d); // fire on expand, not on collapse
            }}
            onSelect={onSelect}
          />
        ))}
      </div>
      {expandedDate && (
        <div ref={detailRef}>
          <DayDetail
            key={`detail-${expandedDate}`}
            date={expandedDate}
            occurrences={byDate.get(expandedDate) ?? []}
            memberBusy={memberBusy}
            onClose={() => setExpandedDate(null)}
            onSelect={onSelect}
          />
        </div>
      )}
    </section>
  );
}
