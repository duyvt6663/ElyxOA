'use client';

/**
 * DECISION RECAP — 015 Calendar day timeline + 016 §5 overlap handling
 * - Chronological 06:00-22:30 lane: member occupied blocks (gray, left) interleaved with
 *   scheduled/substituted health actions (type-colored, right). Proportional by minute.
 * - 016 §5: quick actions (meds/monitoring/food habits) legitimately cluster at the same
 *   time (e.g. 14 at 06:30). Bars are therefore GROUPED by identical {start,end} slot and the
 *   groups are LANE-PACKED so overlaps fan out instead of stacking at one x/y. A grouped slot
 *   renders as "{time} ×N". A reliable chronological action LIST below the lane guarantees
 *   every action is readable + selectable regardless of packing.
 * - "Show occupied slots" (owned by DayDetail) hides the gray busy column.
 */

import type { ScheduledOccurrence, ActivityType, MemberBusyBlock } from '@/lib/types';

const DAY_START = 6 * 60; // 06:00
const DAY_END = 22 * 60 + 30; // 22:30
const SPAN = DAY_END - DAY_START;
const PX = 0.8; // pixels per minute
const MAX_LANES = 4;

function toMin(t?: string): number | null {
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

const TYPE_BAR: Record<ActivityType, string> = {
  fitness: 'bg-indigo-200 border-indigo-400 text-indigo-900',
  food: 'bg-lime-200 border-lime-400 text-lime-900',
  medication: 'bg-rose-200 border-rose-400 text-rose-900',
  therapy: 'bg-violet-200 border-violet-400 text-violet-900',
  consultation: 'bg-sky-200 border-sky-400 text-sky-900',
};

const TYPE_DOT: Record<ActivityType, string> = {
  fitness: 'bg-indigo-500',
  food: 'bg-lime-500',
  medication: 'bg-rose-500',
  therapy: 'bg-violet-500',
  consultation: 'bg-sky-500',
};

interface BusyItem {
  title: string;
  category: string;
  startMin: number;
  endMin: number;
}

interface Slot {
  startMin: number;
  endMin: number;
  items: ScheduledOccurrence[];
  lane: number;
}

export interface DayTimelineProps {
  date: string;
  occurrences: ScheduledOccurrence[];
  memberBusy: MemberBusyBlock[];
  showOccupied: boolean;
  onSelect?: (o: ScheduledOccurrence) => void;
}

export default function DayTimeline({ date, occurrences, memberBusy, showOccupied, onSelect }: DayTimelineProps) {
  const busy: BusyItem[] = [];
  for (const mb of memberBusy) {
    for (const tb of mb.blocks) {
      if (tb.date !== date) continue;
      const s = toMin(tb.startTime);
      const e = toMin(tb.endTime);
      if (s === null || e === null || e <= DAY_START || s >= DAY_END) continue;
      busy.push({ title: mb.title, category: mb.category, startMin: s, endMin: e });
    }
  }

  const timed = occurrences
    .filter((o) => o.startTime && o.status !== 'skipped')
    .sort((a, b) => (a.startTime! < b.startTime! ? -1 : a.startTime! > b.startTime! ? 1 : a.title.localeCompare(b.title)));
  const skipped = occurrences.filter((o) => o.status === 'skipped');

  // Group by identical {start,end} slot, then lane-pack the groups so overlaps fan out.
  const bySlot = new Map<string, Slot>();
  for (const o of timed) {
    const s = toMin(o.startTime)!;
    const e = toMin(o.endTime ?? o.startTime)!;
    const key = `${s}-${e}`;
    const slot = bySlot.get(key) ?? { startMin: s, endMin: e, items: [], lane: 0 };
    slot.items.push(o);
    bySlot.set(key, slot);
  }
  const slots = [...bySlot.values()].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  for (const slot of slots) {
    let lane = laneEnds.findIndex((end) => end <= slot.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(slot.endMin);
    } else {
      laneEnds[lane] = slot.endMin;
    }
    slot.lane = lane;
  }
  const numLanes = Math.min(Math.max(laneEnds.length, 1), MAX_LANES);

  const top = (m: number) => Math.max(0, (Math.max(m, DAY_START) - DAY_START) * PX);
  const barHeight = (s: number, e: number) => Math.max(14, (Math.min(e, DAY_END) - Math.max(s, DAY_START)) * PX);

  // Action column geometry (right side when occupied is shown).
  const colLeftPct = showOccupied ? 50 : 0;
  const colWidthPct = showOccupied ? 50 : 100;
  const laneWidthPct = colWidthPct / numLanes;

  const hours: number[] = [];
  for (let h = 6; h <= 22; h++) hours.push(h);

  return (
    <div>
      <div className="relative flex" style={{ height: SPAN * PX }}>
        <div className="relative w-10 shrink-0 text-[10px] text-gray-400">
          {hours.map((h) => (
            <div key={h} className="absolute left-0" style={{ top: (h * 60 - DAY_START) * PX }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        <div className="relative flex-1 border-l border-gray-200">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ top: (h * 60 - DAY_START) * PX }}
            />
          ))}
          {showOccupied &&
            busy.map((b, i) => (
              <div
                key={`busy-${i}`}
                className="absolute left-0 w-[46%] overflow-hidden rounded border border-gray-300 bg-gray-200/70 px-1 text-[10px] leading-tight text-gray-600"
                style={{ top: top(b.startMin), height: barHeight(b.startMin, b.endMin) }}
                title={`${b.title} (${b.category})`}
              >
                {b.title}
              </div>
            ))}
          {slots.map((slot) => {
            const lane = Math.min(slot.lane, numLanes - 1);
            const single = slot.items[0]!;
            const isGroup = slot.items.length > 1;
            const anySub = slot.items.some((o) => o.status === 'substituted');
            const label = isGroup
              ? `${single.startTime} ×${slot.items.length}`
              : `${single.startTime} ${single.title}`;
            return (
              <button
                key={`${slot.startMin}-${slot.endMin}`}
                type="button"
                onClick={() => !isGroup && onSelect?.(single)}
                className={`absolute overflow-hidden rounded border px-1 text-left text-[10px] leading-tight ${
                  isGroup ? 'bg-white border-gray-300 text-gray-700' : TYPE_BAR[single.type]
                } ${anySub ? 'ring-1 ring-amber-500' : ''} ${isGroup ? 'cursor-default' : 'hover:brightness-95'}`}
                style={{
                  top: top(slot.startMin),
                  height: barHeight(slot.startMin, slot.endMin),
                  left: `${colLeftPct + lane * laneWidthPct}%`,
                  width: `calc(${laneWidthPct}% - 2px)`,
                }}
                title={isGroup ? `${slot.items.length} actions at ${single.startTime}` : `${single.title} ${single.startTime}-${single.endTime}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 016 §5: reliable chronological list — every action readable + selectable. */}
      {timed.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Scheduled actions ({timed.length})</div>
          <ul className="flex flex-col gap-0.5">
            {timed.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(o)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-gray-100"
                >
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[o.type]}`} />
                  <span className="font-mono text-gray-500">{o.startTime}</span>
                  <span className="truncate">{o.title}</span>
                  {o.status === 'substituted' && <span className="text-amber-600">⟳</span>}
                  {o.outsidePreferredWindow && <span className="text-amber-500" title="outside preferred window">◷</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Skipped / no slot ({skipped.length})</div>
          <div className="flex flex-wrap gap-1">
            {skipped.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect?.(o)}
                className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 opacity-70 hover:opacity-100"
              >
                ✕ {o.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
