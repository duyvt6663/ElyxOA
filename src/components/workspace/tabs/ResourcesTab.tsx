/**
 * DECISION RECAP — 013 Resources Tab
 * - Four labelled sections: Equipment, Specialists, Allied Health, Travel.
 * - Each resource renders a horizontal mini-timeline of the 92-day window with
 *   blocked/available ranges colored.
 * - Color scheme (locked):
 *     Equipment       — green default + red overlay for blocked ranges.
 *     Specialists     — gray default (unbookable) + green overlay for available windows.
 *     Allied Health   — gray default + green overlay for available windows.
 *     Travel          — gray default + red overlay for member-blocked ranges.
 * - Range click → `onSelect({ selectedDate: <range.start>, activeTab: 'resources' })`
 *   so the chat grounding payload sees the user's intent. Hover/tap to reveal exact
 *   dates is impl pass.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - 011 stub. Real content lands in 013.
 * - Props declared in full so 013 has a concrete target.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render four sections (Equipment, Specialists, Allied Health, Travel).
 * 2. For each resource, render a row: label + role + a 92-day-wide bar with overlay
 *    bands positioned by % offset against the window start.
 * 3. Band click → onSelect(...) per range.
 */

import type { AvailabilityBundle, DateRange } from '@/lib/types';
import { WINDOW_START, WINDOW_END } from '@/lib/types';
import type { WorkspaceSelection } from '../AllocatorWorkspace';

export interface ResourcesTabProps {
  availability: AvailabilityBundle;
  selection: WorkspaceSelection;
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
}

const WINDOW_START_MS = Date.UTC(
  Number(WINDOW_START.slice(0, 4)),
  Number(WINDOW_START.slice(5, 7)) - 1,
  Number(WINDOW_START.slice(8, 10))
);
const WINDOW_END_MS = Date.UTC(
  Number(WINDOW_END.slice(0, 4)),
  Number(WINDOW_END.slice(5, 7)) - 1,
  Number(WINDOW_END.slice(8, 10))
);
const WINDOW_DAYS = Math.round((WINDOW_END_MS - WINDOW_START_MS) / 86_400_000) + 1; // 92

function dayIndex(date: string): number {
  const ms = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  );
  return Math.round((ms - WINDOW_START_MS) / 86_400_000);
}

function bandStyle(range: DateRange) {
  const startIdx = Math.max(0, dayIndex(range.start));
  const endIdx = Math.min(WINDOW_DAYS - 1, dayIndex(range.end));
  const left = (startIdx / WINDOW_DAYS) * 100;
  const width = ((endIdx - startIdx + 1) / WINDOW_DAYS) * 100;
  return { left: left + '%', width: width + '%' };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  role: string;
  defaultBg: string;
  overlays: Array<{ range: DateRange; overlayBg: string; tooltip: string }>;
  onBand: (date: string) => void;
}

function ResourceRow({ label, role, defaultBg, overlays, onBand }: RowProps) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs">
      <span className="w-40 truncate text-gray-700">{label}</span>
      <span className="w-32 truncate text-gray-500">{role}</span>
      <div className={`relative flex-1 h-3 rounded overflow-hidden ${defaultBg}`}>
        {overlays.map((o, i) => (
          <button
            key={i}
            type="button"
            title={o.tooltip}
            onClick={() => onBand(o.range.start)}
            className={`absolute top-0 bottom-0 ${o.overlayBg} hover:brightness-110`}
            style={bandStyle(o.range)}
          />
        ))}
      </div>
    </div>
  );
}

export default function ResourcesTab({ availability, selection: _selection, onSelect }: ResourcesTabProps) {
  const onBand = (date: string) => onSelect({ selectedDate: date, activeTab: 'resources' });

  return (
    <div className="p-4 text-sm">
      <Section title={`Equipment (${availability.equipment.length})`}>
        {availability.equipment.map((e) => (
          <ResourceRow
            key={e.id}
            label={e.label}
            role={e.role}
            defaultBg="bg-emerald-300"
            overlays={e.blocked.map((r) => ({
              range: r,
              overlayBg: 'bg-red-400',
              tooltip: `${r.start} → ${r.end} (${e.role}/${e.label}) — blocked`,
            }))}
            onBand={onBand}
          />
        ))}
      </Section>
      <Section title={`Specialists (${availability.specialists.length})`}>
        {availability.specialists.map((s) => (
          <ResourceRow
            key={s.id}
            label={s.name}
            role={s.role}
            defaultBg="bg-gray-200"
            overlays={s.available.map((r) => ({
              range: r,
              overlayBg: 'bg-emerald-300',
              tooltip: `${r.start} → ${r.end} (${s.role}/${s.name}) — available`,
            }))}
            onBand={onBand}
          />
        ))}
      </Section>
      <Section title={`Allied Health (${availability.alliedHealth.length})`}>
        {availability.alliedHealth.map((a) => (
          <ResourceRow
            key={a.id}
            label={a.name}
            role={a.role}
            defaultBg="bg-gray-200"
            overlays={a.available.map((r) => ({
              range: r,
              overlayBg: 'bg-emerald-300',
              tooltip: `${r.start} → ${r.end} (${a.role}/${a.name}) — available`,
            }))}
            onBand={onBand}
          />
        ))}
      </Section>
      <Section title={`Travel (${availability.travel.length})`}>
        {availability.travel.map((t) => (
          <ResourceRow
            key={t.id}
            label={t.destination}
            role="travel"
            defaultBg="bg-gray-200"
            overlays={t.blocked.map((r) => ({
              range: r,
              overlayBg: 'bg-red-400',
              tooltip: `${r.start} → ${r.end} (travel/${t.destination}) — blocked`,
            }))}
            onBand={onBand}
          />
        ))}
      </Section>
    </div>
  );
}
