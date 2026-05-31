'use client';

/**
 * DECISION RECAP — 015 Calendar day timeline
 * - The reviewer-facing headline: a chronological 06:00-22:30 lane showing the member's
 *   occupied blocks (gray, left) interleaved with scheduled/substituted health actions
 *   (type-colored, right). Proportional by wall-clock minute.
 * - "Show occupied slots" (owned by DayDetail) hides the gray busy column without moving
 *   the actions, so the reviewer sees exactly what the allocator scheduled around.
 * - Skipped occurrences have no slot -> listed dimmed below the lane.
 */

import type { ScheduledOccurrence, ActivityType, MemberBusyBlock } from '@/lib/types';

const DAY_START = 6 * 60; // 06:00
const DAY_END = 22 * 60 + 30; // 22:30
const SPAN = DAY_END - DAY_START;
const PX = 0.8; // pixels per minute

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

interface BusyItem {
  title: string;
  category: string;
  startMin: number;
  endMin: number;
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
  const timed = occurrences.filter((o) => o.startTime && o.status !== 'skipped');
  const skipped = occurrences.filter((o) => o.status === 'skipped');

  const top = (m: number) => Math.max(0, (Math.max(m, DAY_START) - DAY_START) * PX);
  const barHeight = (s: number, e: number) => Math.max(14, (Math.min(e, DAY_END) - Math.max(s, DAY_START)) * PX);

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
          {timed.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect?.(o)}
              className={`absolute overflow-hidden rounded border px-1 text-left text-[10px] leading-tight hover:brightness-95 ${TYPE_BAR[o.type]} ${
                o.status === 'substituted' ? 'ring-1 ring-amber-500' : ''
              }`}
              style={{
                top: top(toMin(o.startTime)!),
                height: barHeight(toMin(o.startTime)!, toMin(o.endTime)!),
                left: showOccupied ? '50%' : '0',
                right: 0,
              }}
              title={`${o.title} ${o.startTime}-${o.endTime}${o.status === 'substituted' ? ' (substituted)' : ''}`}
            >
              {o.startTime} {o.title}
              {o.status === 'substituted' ? ' (sub)' : ''}
            </button>
          ))}
        </div>
      </div>
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
