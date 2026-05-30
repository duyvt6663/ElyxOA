/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Shared component used as chip (in DayCell) and as detail (in DayDetail / AgendaList).
 * - Status visualization:
 *     'scheduled'   -> full opacity, status badge.
 *     'substituted' -> shows effective-vs-source + reason; amber-ish badge.
 *     'skipped'     -> DIMMED-BUT-VISIBLE (opacity-60); shows skipAdjustment + reason.
 * - Detail variant additionally shows facilitator, location + remote indicator, prep,
 *   metrics, durationMinutes.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render title + status badge + type badge in both variants.
 * 2. If status === 'substituted', render an "originally <sourceActivityId>" line + reason.
 * 3. If status === 'skipped', render skipAdjustment + reason, apply opacity-60.
 * 4. In detail variant, render facilitator/location/remote/prep/metrics/duration.
 */

import type { KeyboardEvent } from 'react';
import type { ScheduledOccurrence, ActivityType } from '@/lib/types';

const STATUS_STYLES: Record<ScheduledOccurrence['status'], { badge: string; row: string }> = {
  scheduled:   { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', row: 'border-emerald-200' },
  substituted: { badge: 'bg-amber-100 text-amber-800 border-amber-200',       row: 'border-amber-200' },
  skipped:     { badge: 'bg-gray-100 text-gray-700 border-gray-200',          row: 'border-gray-200 opacity-60' },
};

const TYPE_STYLES: Record<ActivityType, string> = {
  fitness:      'bg-indigo-100 text-indigo-800',
  food:         'bg-lime-100 text-lime-800',
  medication:   'bg-rose-100 text-rose-800',
  therapy:      'bg-violet-100 text-violet-800',
  consultation: 'bg-sky-100 text-sky-800',
};

export interface OccurrenceCardProps {
  occurrence: ScheduledOccurrence;
  variant?: 'chip' | 'detail';
  onSelect?: (occurrence: ScheduledOccurrence) => void;
}

export default function OccurrenceCard({
  occurrence,
  variant = 'chip',
  onSelect,
}: OccurrenceCardProps) {
  const s = STATUS_STYLES[occurrence.status];
  const t = TYPE_STYLES[occurrence.type];

  // Single-letter status glyph: S=scheduled, B=substituted (backup), X=skipped.
  // ('substituted' and 'skipped' both start with 's' — letter must disambiguate.)
  const STATUS_GLYPH = { scheduled: 'S', substituted: 'B', skipped: 'X' } as const;

  // 011 impl: when onSelect is provided, the outer element becomes a keyboard-
  // accessible button-like surface. When absent, render exactly as before.
  const selectable = !!onSelect;
  const selectProps = selectable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onSelect!(occurrence),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect!(occurrence);
          }
        },
        'aria-label': `Select ${occurrence.title} on ${occurrence.date}`,
      }
    : {};
  const cursorClass = selectable ? 'cursor-pointer' : '';

  if (variant === 'chip') {
    return (
      <div
        className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${s.row} ${cursorClass}`}
        title={`${occurrence.status}: ${occurrence.title}`}
        {...selectProps}
      >
        <span className={`inline-block rounded px-1.5 py-0.5 border text-[10px] ${s.badge}`}>
          {STATUS_GLYPH[occurrence.status]}
        </span>
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${t}`}>
          {occurrence.type}
        </span>
        <span className="truncate">{occurrence.title}</span>
      </div>
    );
  }

  return (
    <article
      className={`flex flex-col gap-2 rounded border p-3 text-sm ${s.row} ${cursorClass}`}
      {...selectProps}
    >
      <header className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 border text-xs font-medium ${s.badge}`}>
          {occurrence.status}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs ${t}`}>{occurrence.type}</span>
        <h4 className="font-medium">{occurrence.title}</h4>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
        <div>
          <dt className="text-gray-500">Facilitator</dt>
          <dd>{occurrence.facilitatorLabel}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Location</dt>
          <dd>
            {occurrence.location}
            {occurrence.isRemote ? ' · remote' : ''}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Duration</dt>
          <dd>{occurrence.durationMinutes}m</dd>
        </div>
        <div>
          <dt className="text-gray-500">Date</dt>
          <dd>{occurrence.date}</dd>
        </div>
      </dl>

      {occurrence.details && (
        <p className="text-xs text-gray-700">{occurrence.details}</p>
      )}

      {occurrence.prep.length > 0 && (
        <div>
          <div className="text-xs text-gray-500">Prep</div>
          <ul className="list-disc pl-5 text-xs">
            {occurrence.prep.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {occurrence.metrics.length > 0 && (
        <div>
          <div className="text-xs text-gray-500">Metrics</div>
          <ul className="list-disc pl-5 text-xs">
            {occurrence.metrics.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {occurrence.boundResources.length > 0 && (
        <div className="text-xs text-gray-500">
          Resources: {occurrence.boundResources.map((b) => `${b.role}: ${b.id}`).join(', ')}
        </div>
      )}

      {occurrence.status === 'substituted' && (
        <aside className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <strong>Substituted:</strong> {occurrence.effectiveActivityId} replaces{' '}
          {occurrence.sourceActivityId} — {occurrence.reason}
        </aside>
      )}

      {occurrence.status === 'skipped' && (
        <aside className="rounded bg-gray-100 border border-gray-200 p-2 text-xs text-gray-700">
          <strong>Skipped:</strong> {occurrence.reason}
          {occurrence.skipAdjustment ? ` · Adjustment: ${occurrence.skipAdjustment}` : ''}
        </aside>
      )}
    </article>
  );
}
