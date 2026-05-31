/**
 * DECISION RECAP — 016 §11 Calendar display bundles
 * - The fixture models many lifestyle micro-habits as separate daily food/medication
 *   activities (12 daily food + 9 daily medication). Rendering each as its own calendar row
 *   is too noisy for a customer-facing view.
 * - A DETERMINISTIC bundler (no LLM required) groups eligible occurrences by
 *   (type, resolved anchor) into named buckets ("Morning meds", "Lunch nutrition", ...).
 *   The scheduler tags each eligible occurrence with displayBundleId/displayBundleLabel; the
 *   raw occurrence ledger is untouched (Trace/Priority stay per-occurrence).
 * - CORRECTNESS GUARDRAIL (016 §11 decision): bundle ONLY scheduled, quick, daily food/med
 *   with no resource requirement. Skipped, substituted, monitoring (BP/CGM via their device
 *   resource), and all blocking fitness/therapy/consultations ALWAYS render individually so
 *   bundles never hide the adaptation story or the temporal demo.
 * - Labels are a fixed map by default; an optional LLM pass (generate:bundles) may override
 *   them via src/data/calendar-bundles.json, applied through `labelOverrides`.
 * - Pure: no I/O, no clock.
 */

import type { Activity, ActivityTemporalPolicy } from './types';
import bundlesFixture from '@/data/calendar-bundles.json';

// 016 §11: optional committed label overrides from the LLM pass (generate:bundles). Empty by
// default → the deterministic map below is used. An explicit labelOverrides arg still wins.
const FIXTURE_LABELS: Record<string, string> = (bundlesFixture as { labels?: Record<string, string> }).labels ?? {};

// Canonical time bucket per anchor — wake+breakfast collapse to one bucket so a wake-anchored
// med and a breakfast-anchored med always land in the SAME bundle (regardless of label).
const ANCHOR_BUCKET: Record<string, string> = {
  wake: 'morning',
  breakfast: 'morning',
  lunch: 'midday',
  dinner: 'evening',
  bedtime: 'bedtime',
  any: 'any',
};

/** Member-facing label per `${type}:${bucket}`. */
const BUNDLE_LABELS: Record<string, string> = {
  'medication:morning': 'Morning meds',
  'medication:midday': 'Midday meds',
  'medication:evening': 'Evening meds',
  'medication:bedtime': 'Bedtime meds',
  'medication:any': 'Daily meds',
  'food:morning': 'Breakfast nutrition',
  'food:midday': 'Lunch nutrition',
  'food:evening': 'Dinner nutrition',
  'food:bedtime': 'Evening nutrition',
  'food:any': 'Daily nutrition',
};

export interface BundleAssignment {
  bundleId: string;
  label: string;
}

/**
 * Returns the display-bundle assignment for an activity given its resolved policy, or null
 * when the activity is not bundle-eligible. Eligibility is intentionally strict (see guardrail).
 * `status` is checked by the caller — only `scheduled` occurrences are bundled.
 */
export function bundleAssignment(
  activity: Activity,
  policy: ActivityTemporalPolicy,
  labelOverrides?: Record<string, string>,
): BundleAssignment | null {
  if (activity.type !== 'food' && activity.type !== 'medication') return null;
  if (activity.frequency.period !== 'day') return null;
  // A resource requirement means a device (bp-cuff/glucose-monitor/...) or clinician — keep
  // those individual (monitoring readings are demo-critical and shouldn't be collapsed).
  if (activity.resources.length > 0) return null;

  const bucket = ANCHOR_BUCKET[policy.anchor ?? 'any'] ?? 'any';
  const key = `${activity.type}:${bucket}`;
  // Bundle id is the canonical (type, bucket) — stable regardless of label, so wake/breakfast
  // always share one bundle even if an LLM relabels only one anchor.
  const bundleId = `${activity.type}-${bucket}`;
  const label =
    labelOverrides?.[key] ??
    FIXTURE_LABELS[key] ??
    BUNDLE_LABELS[key] ??
    (activity.type === 'medication' ? 'Daily meds' : 'Daily nutrition');
  return { bundleId, label };
}
