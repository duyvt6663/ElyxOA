/**
 * DECISION RECAP — 015 Deterministic Default Policy Compiler
 * - Derives an ActivityTemporalPolicy from activity.type + title keywords so the
 *   116-record fixture needs explicit `temporalPolicy` only on demo-critical activities.
 * - Merge order (applied by the scheduler in Task 5): explicit activity.temporalPolicy >
 *   validated LLM hint > this default.
 * - Pure: no I/O, no clock. Keyed off the lowercased title; approximate by design — the
 *   handful of activities that must place precisely carry an explicit override in the fixture.
 * - 024: high-intensity fitness default carries a high↔high same-day avoidAfter rule (withinMinutes
 *   > waking span) so no two high-intensity sessions share a day. The temporal-rule check is
 *   symmetric, so a default-high candidate also separates from an explicit-policy high.
 */

/**
 * PSEUDO-ALGORITHM (getDefaultTemporalPolicy)
 * 1. Lowercase the title once.
 * 2. Switch on activity.type; within each type, refine by title keyword:
 *      medication -> monitoring (BP/CGM/oximeter) | evening | morning(default).
 *      fitness    -> high-intensity | low (mobility/walk) | moderate(default).
 *      food       -> breakfast | dinner | lunch(default).
 *      therapy    -> downshift/sleep | recovery(contrast/ice) | general(default).
 *      consultation -> business hours.
 * 3. Return a fully-formed ActivityTemporalPolicy (never undefined).
 */

import type { Activity, ActivityTemporalPolicy, TimeBlockPreference } from './types';

// Preferred-window presets (reused across defaults).
const EARLY_MORNING: TimeBlockPreference = { label: 'morning', startTime: '06:30', endTime: '08:30' };
const MORNING: TimeBlockPreference = { label: 'morning', startTime: '07:00', endTime: '09:00' };
const FITNESS_AM: TimeBlockPreference = { label: 'morning', startTime: '07:00', endTime: '11:00' };
const FITNESS_PM: TimeBlockPreference = { label: 'afternoon', startTime: '16:00', endTime: '18:30' };
const LUNCH: TimeBlockPreference = { label: 'midday', startTime: '12:00', endTime: '13:30' };
const DINNER: TimeBlockPreference = { label: 'evening', startTime: '19:00', endTime: '20:30' };
const EVENING_MED: TimeBlockPreference = { label: 'evening', startTime: '19:00', endTime: '21:00' };
const BEDTIME: TimeBlockPreference = { label: 'evening', startTime: '20:30', endTime: '22:00' };
const BUSINESS: TimeBlockPreference = { label: 'midday', startTime: '09:00', endTime: '17:00' };
const ANYTIME: TimeBlockPreference = { label: 'midday', startTime: '08:00', endTime: '20:00' };

const has = (title: string, ...needles: string[]): boolean => needles.some((n) => title.includes(n));

export function getDefaultTemporalPolicy(activity: Activity): ActivityTemporalPolicy {
  const t = activity.title.toLowerCase();

  switch (activity.type) {
    case 'medication': {
      // Monitoring / readings: morning, before exertion; keep clear of high-intensity fitness.
      if (has(t, 'blood pressure', 'glucose', 'cgm', 'monitor', 'reading', 'oximeter', 'log') || /\bbp\b/.test(t)) {
        return {
          preferredWindows: [EARLY_MORNING],
          anchor: 'breakfast',
          intensity: 'none',
          avoidAfter: [
            {
              activityType: 'fitness',
              intensity: 'high',
              withinMinutes: 120,
              reason: 'monitoring reading should not follow high-intensity exertion',
            },
          ],
        };
      }
      if (has(t, 'evening', 'night', 'bedtime', 'magnesium', 'sleep')) {
        return { preferredWindows: [EVENING_MED], anchor: 'dinner', intensity: 'none' };
      }
      return { preferredWindows: [MORNING], anchor: 'breakfast', intensity: 'none' };
    }

    case 'fitness': {
      if (has(t, 'vo2', 'hiit', 'sprint', 'interval', 'threshold', 'plyometric', 'power', 'tempo')) {
        return {
          preferredWindows: [FITNESS_AM, FITNESS_PM],
          intensity: 'high',
          avoidAfter: [
            { category: 'meal', withinMinutes: 90, reason: 'high-intensity training should not start within 90 min after a meal' },
            // 024 — two high-intensity sessions should not share a day (recovery). withinMinutes is
            // larger than the waking span, so any same-day pair conflicts; the temporal-rule check is
            // intra-day only, so this is a same-day ban with no cross-day reach.
            { activityType: 'fitness', intensity: 'high', withinMinutes: 24 * 60, reason: 'two high-intensity sessions should not share a day (recovery)' },
          ],
        };
      }
      if (has(t, 'mobility', 'stretch', 'flex', 'foam', 'walk', 'yoga', 'pilates', 'balance', 'reset', 'step')) {
        return { preferredWindows: [ANYTIME], intensity: 'low' };
      }
      return { preferredWindows: [FITNESS_AM, FITNESS_PM], intensity: 'moderate' };
    }

    case 'food': {
      if (has(t, 'breakfast')) return { preferredWindows: [MORNING], anchor: 'breakfast', intensity: 'none' };
      if (has(t, 'dinner', 'supper', 'evening')) return { preferredWindows: [DINNER], anchor: 'dinner', intensity: 'none' };
      return { preferredWindows: [LUNCH], anchor: 'lunch', intensity: 'none' };
    }

    case 'therapy': {
      if (has(t, 'downshift', 'sleep', 'breath', 'sauna', 'wind', 'meditat')) {
        return {
          preferredWindows: [BEDTIME],
          anchor: 'bedtime',
          intensity: 'low',
          avoidAfter: [
            {
              activityType: 'fitness',
              intensity: 'high',
              withinMinutes: 120,
              reason: 'downshift therapy should not follow high-intensity training too closely',
            },
          ],
        };
      }
      if (has(t, 'contrast', 'ice', 'cryo', 'cold', 'recovery', 'massage')) {
        // Recovery should follow training; prefer afternoon/evening, keep a 30-min buffer.
        return {
          preferredWindows: [FITNESS_PM],
          intensity: 'low',
          minGapAfterMinutes: 30,
        };
      }
      return { preferredWindows: [ANYTIME], intensity: 'low' };
    }

    case 'consultation':
      return { preferredWindows: [BUSINESS], anchor: 'any', intensity: 'none' };
  }

  // Fallback (unreachable for the closed ActivityType union; satisfies control-flow).
  return { preferredWindows: [ANYTIME], anchor: 'any', intensity: 'none' };
}
