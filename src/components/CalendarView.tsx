'use client';

/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Hand-rolled month grid + Jun/Jul/Aug switcher; no calendar libs.
 * - Tailwind utility classes for layout SHELL.
 * - Owns month + filter state; passes derived data down.
 * - Status visualization: scheduled (full), substituted (effective+source+reason),
 *   skipped (DIMMED-BUT-VISIBLE so adaptation is auditable; not hidden).
 * - Desktop: MonthGrid -> DayCell -> DayDetail (inline expansion, no modal).
 * - Mobile: collapses to a single-column AgendaList.
 * - Inputs: precomputed ScheduleResult; UI does NOT call schedule().
 */

/**
 * BEHAVIOR SKETCH
 * 1. Initialize month='Jun', statusFilters=all 3, typeFilters=all known types.
 * 2. Derive filteredOccurrences from result.scheduled by applying month/status/type filters.
 * 3. Render SummaryHeader (counts), FilterBar (toggles), Legend (color key).
 * 4. Viewport-conditional: desktop renders MonthGrid; mobile renders AgendaList.
 * 5. Toggle handlers mutate Set copies and setState; month switch swaps visible month.
 */

import { useState } from 'react';
import type {
  ScheduleResult,
  ScheduledOccurrence,
  ActivityType,
  MemberBusyBlock,
} from '@/lib/types';
import SummaryHeader from './SummaryHeader';
import FilterBar from './FilterBar';
import Legend from './Legend';
import MonthGrid from './MonthGrid';
import AgendaList from './AgendaList';

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const ALL_STATUSES = ['scheduled', 'substituted', 'skipped'] as const satisfies ReadonlyArray<ScheduledOccurrence['status']>;
const ALL_TYPES = ['fitness', 'food', 'medication', 'therapy', 'consultation'] as const satisfies ReadonlyArray<ActivityType>;

export interface CalendarViewProps {
  result: ScheduleResult;
  /** 015 — member occupied blocks for the day-timeline view. */
  memberBusy?: MemberBusyBlock[];
  /** 011: optional selection callback fired when a chip is clicked. Wired in 011 impl: forwarded down to MonthGrid + AgendaList → OccurrenceCard. */
  onSelect?: (occurrence: ScheduledOccurrence) => void;
}

export default function CalendarView({ result, memberBusy = [], onSelect }: CalendarViewProps) {
  // 011 impl: onSelect is forwarded to MonthGrid + AgendaList; chips invoke it on click.
  const [month, setMonth] = useState<'Jun' | 'Jul' | 'Aug'>('Jun');
  const [statusFilters, setStatusFilters] = useState<Set<ScheduledOccurrence['status']>>(() => new Set(ALL_STATUSES));
  const [typeFilters, setTypeFilters] = useState<Set<ActivityType>>(() => new Set(ALL_TYPES));

  const filtered = result.occurrences.filter(
    (o) => statusFilters.has(o.status) && typeFilters.has(o.type)
  );

  const resetFilters = () => {
    setStatusFilters(new Set(ALL_STATUSES));
    setTypeFilters(new Set(ALL_TYPES));
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <SummaryHeader result={result} />
      <FilterBar
        month={month}
        onMonthChange={setMonth}
        statusFilters={statusFilters}
        onStatusToggle={(s) => setStatusFilters((prev) => toggleSet(prev, s))}
        typeFilters={typeFilters}
        onTypeToggle={(t) => setTypeFilters((prev) => toggleSet(prev, t))}
        onReset={resetFilters}
      />
      <Legend />
      <div className="hidden md:block">
        <MonthGrid occurrences={filtered} month={month} year={2026} memberBusy={memberBusy} onSelect={onSelect} />
      </div>
      <div className="block md:hidden">
        <AgendaList occurrences={filtered} month={month} memberBusy={memberBusy} onSelect={onSelect} />
      </div>
    </div>
  );
}
