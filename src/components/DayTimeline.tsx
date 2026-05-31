'use client';

/**
 * DECISION RECAP — 015 day timeline + 016 §5 overlap handling + 016 §11 display bundles
 * - Chronological 06:00-22:30 lane: member occupied blocks (gray, left) interleaved with
 *   scheduled/substituted health actions (type-colored, right), proportional by minute.
 * - 016 §11: scheduled low-risk daily food/med carry displayBundleId/Label from the scheduler.
 *   They render as ONE expandable entry per bundle ("Morning meds ×4") instead of N rows.
 * - 016 §5: non-bundled actions that share an identical {start,end} slot are grouped ("12:00 ×2")
 *   and lane-packed so overlaps fan out. A chronological list below makes every action (raw,
 *   inside bundles too) readable + selectable.
 * - 016 §10: substituted rows show "title ← source".
 */

import { useState } from 'react';
import type { ScheduledOccurrence, ActivityType, MemberBusyBlock } from '@/lib/types';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60 + 30;
const SPAN = DAY_END - DAY_START;
const PX = 0.8;
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

interface Entry {
  key: string;
  kind: 'bundle' | 'slot';
  label: string; // bundle label, or single title, or "HH:MM ×N"
  type: ActivityType;
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
  const [openEntries, setOpenEntries] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpenEntries((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

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

  // Build entries: semantic bundles first, then slot-group the rest.
  const entries: Entry[] = [];
  const bundleMap = new Map<string, ScheduledOccurrence[]>();
  const loose: ScheduledOccurrence[] = [];
  for (const o of timed) {
    if (o.displayBundleId) {
      const arr = bundleMap.get(o.displayBundleId) ?? [];
      arr.push(o);
      bundleMap.set(o.displayBundleId, arr);
    } else {
      loose.push(o);
    }
  }
  // 016 §B: a bundle of one is just a normal action — render it raw, not as "Label ×1".
  for (const [id, items] of [...bundleMap]) {
    if (items.length === 1) {
      loose.push(items[0]!);
      bundleMap.delete(id);
    }
  }
  for (const [id, items] of bundleMap) {
    const starts = items.map((o) => toMin(o.startTime)!);
    const ends = items.map((o) => toMin(o.endTime ?? o.startTime)!);
    entries.push({
      key: `bundle-${id}`,
      kind: 'bundle',
      label: `${items[0]!.displayBundleLabel} ×${items.length}`,
      type: items[0]!.type,
      startMin: Math.min(...starts),
      endMin: Math.max(...ends),
      items: items.sort((a, b) => a.startTime!.localeCompare(b.startTime!)),
      lane: 0,
    });
  }
  // Slot-group the loose (non-bundled) actions by identical {start,end}.
  const slotMap = new Map<string, ScheduledOccurrence[]>();
  for (const o of loose) {
    const k = `${toMin(o.startTime)}-${toMin(o.endTime ?? o.startTime)}`;
    const arr = slotMap.get(k) ?? [];
    arr.push(o);
    slotMap.set(k, arr);
  }
  for (const [, items] of slotMap) {
    const s = toMin(items[0]!.startTime)!;
    const e = toMin(items[0]!.endTime ?? items[0]!.startTime)!;
    const single = items[0]!;
    // 016 §D: give the bland "HH:MM ×N" group a hint of its contents (sub count).
    const subs = items.filter((o) => o.status === 'substituted').length;
    const hint = subs > 0 ? ` · ${subs} sub` : '';
    entries.push({
      key: `slot-${s}-${e}`,
      kind: 'slot',
      label: items.length > 1 ? `${single.startTime} ×${items.length}${hint}` : `${single.startTime} ${single.title}`,
      type: single.type,
      startMin: s,
      endMin: e,
      items,
      lane: 0,
    });
  }

  entries.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  for (const en of entries) {
    let lane = laneEnds.findIndex((end) => end <= en.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(en.endMin);
    } else {
      laneEnds[lane] = en.endMin;
    }
    en.lane = lane;
  }
  const numLanes = Math.min(Math.max(laneEnds.length, 1), MAX_LANES);

  const top = (m: number) => Math.max(0, (Math.max(m, DAY_START) - DAY_START) * PX);
  const barHeight = (s: number, e: number) => Math.max(14, (Math.min(e, DAY_END) - Math.max(s, DAY_START)) * PX);
  const colLeftPct = showOccupied ? 50 : 0;
  const colWidthPct = showOccupied ? 50 : 100;
  const laneWidthPct = colWidthPct / numLanes;

  const hours: number[] = [];
  for (let h = 6; h <= 22; h++) hours.push(h);

  // Chronological list rows: bundles + slot-groups + singles, sorted by start.
  // List rows: SEMANTIC bundles stay collapsed (named + timestamped); everything else (monitoring,
  // substituted, blocking) lists INDIVIDUALLY — they're heterogeneous and not nameable as one
  // bundle, so a bland "07:30 ×9" helps no one. Merge + sort by start time.
  const listRows: Array<{ sort: number; bundle: Entry | null; occ: ScheduledOccurrence | null }> = [
    ...entries.filter((e) => e.kind === 'bundle').map((e) => ({ sort: e.startMin, bundle: e, occ: null })),
    ...loose.map((o) => ({ sort: toMin(o.startTime)!, bundle: null as Entry | null, occ: o })),
  ].sort((a, b) => a.sort - b.sort);

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
            <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: (h * 60 - DAY_START) * PX }} />
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
          {entries.map((en) => {
            const lane = Math.min(en.lane, numLanes - 1);
            const single = en.items.length === 1 ? en.items[0]! : null;
            const grouped = !single;
            const anySub = en.items.some((o) => o.status === 'substituted');
            return (
              <button
                key={en.key}
                type="button"
                onClick={() => (single ? onSelect?.(single) : toggle(en.key))}
                className={`absolute overflow-hidden rounded border px-1 text-left text-[10px] leading-tight hover:brightness-95 ${
                  grouped ? 'bg-white border-gray-300 text-gray-700' : TYPE_BAR[en.type]
                } ${anySub ? 'ring-1 ring-amber-500' : ''}`}
                style={{
                  top: top(en.startMin),
                  height: barHeight(en.startMin, en.endMin),
                  left: `${colLeftPct + lane * laneWidthPct}%`,
                  width: `calc(${laneWidthPct}% - 2px)`,
                }}
                title={en.kind === 'bundle' ? `${en.label} (tap to expand)` : single ? `${single.title} ${single.startTime}-${single.endTime}` : en.label}
              >
                {en.kind === 'bundle' ? en.label : single ? `${single.startTime} ${single.title}` : en.label}
              </button>
            );
          })}
        </div>
      </div>

      {timed.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Scheduled actions ({timed.length})</div>
          <ul className="flex flex-col gap-0.5">
            {listRows.map((r) => {
              if (!r.bundle) return <ActionRow key={r.occ!.id} occ={r.occ!} onSelect={onSelect} />;
              const e = r.bundle;
              const isOpen = openEntries.has(e.key);
              return (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => toggle(e.key)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-gray-100"
                  >
                    <span className="w-3 shrink-0 text-center text-gray-400">{isOpen ? '▾' : '▸'}</span>
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[e.type]}`} />
                    <span className="font-mono text-gray-500">{e.items[0]!.startTime}</span>
                    <span className="font-medium">
                      {e.items[0]!.displayBundleLabel} ×{e.items.length}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="ml-3 border-l border-gray-200 pl-2">
                      {e.items.map((o) => (
                        <ActionRow key={o.id} occ={o} onSelect={onSelect} nested />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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

function ActionRow({
  occ,
  onSelect,
  nested,
}: {
  occ: ScheduledOccurrence;
  onSelect?: (o: ScheduledOccurrence) => void;
  /** Inside a bundle's expansion (already indented), so skip the leading chevron-width spacer. */
  nested?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(occ)}
        className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-gray-100"
      >
        {/* 016 §2: spacer matching the bundle toggle's chevron so single rows align by time column. */}
        {!nested && <span className="w-3 shrink-0" />}
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[occ.type]}`} />
        <span className="font-mono text-gray-500">{occ.startTime}</span>
        <span className="truncate">{occ.title}</span>
        {occ.status === 'substituted' && (
          <span className="shrink-0 text-amber-600">
            {occ.sourceTitle ? <span className="text-gray-400">← {occ.sourceTitle}</span> : 'sub'}
          </span>
        )}
        {occ.outsidePreferredWindow && <span className="text-amber-500" title="outside preferred window">◷</span>}
      </button>
    </li>
  );
}
