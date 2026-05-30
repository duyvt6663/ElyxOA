/**
 * DECISION RECAP — 006 Render Calendar Output
 * - Static legend mapping status + type to color tokens.
 * - Skipped is DIMMED-BUT-VISIBLE in the legend (matches occurrence rendering).
 * - No props; pure presentational.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render a row of swatches for the 3 statuses with labels.
 * 2. Render a row of swatches for the known ActivityType values with labels.
 */

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

export default function Legend(_: Record<string, never> = {}) {
  return (
    <section className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-600">Status</span>
        <span className={`rounded border px-2 py-0.5 ${STATUS_STYLES.scheduled.badge}`}>
          scheduled
        </span>
        <span className={`rounded border px-2 py-0.5 ${STATUS_STYLES.substituted.badge}`}>
          substituted
        </span>
        <span className={`rounded border px-2 py-0.5 ${STATUS_STYLES.skipped.badge}`}>
          skipped
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-600">Type</span>
        <span className={`rounded border px-2 py-0.5 ${TYPE_STYLES.fitness}`}>fitness</span>
        <span className={`rounded border px-2 py-0.5 ${TYPE_STYLES.food}`}>food</span>
        <span className={`rounded border px-2 py-0.5 ${TYPE_STYLES.medication}`}>medication</span>
        <span className={`rounded border px-2 py-0.5 ${TYPE_STYLES.therapy}`}>therapy</span>
        <span className={`rounded border px-2 py-0.5 ${TYPE_STYLES.consultation}`}>
          consultation
        </span>
      </div>
    </section>
  );
}
