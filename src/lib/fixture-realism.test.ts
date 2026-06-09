/**
 * DECISION RECAP — 025 Fixture realism guards
 * - Fixture-level acceptance for 025 G1/G2 (data-quality fixes), runnable in CI via `npm test`.
 * - G1: a "breakfast" food must place in the morning, never at night. `Protein-Forward Breakfast`
 *   is now a quick habit (<20 min, non-blocking) so it coincides with the busy morning instead of
 *   being pushed off-window to the evening for an exclusive slot.
 * - G2: fitness admin/readiness tasks carry an explicit low-intensity policy so they do not count as
 *   moderate training load (which inflated the per-day moderate count and forced 024 to scope out a
 *   moderate cap).
 * - Runs the real committed fixture through scheduleTemporal once and asserts the invariants.
 */

import { describe, it, expect } from 'vitest';
import { scheduleTemporal } from './temporal-scheduler';
import { getDefaultTemporalPolicy } from './temporal-policy';
import activitiesJson from '../data/activities.json';
import availabilityJson from '../data/availability.json';
import hintsJson from '../data/scheduling-hints.json';
import type { Activity, AvailabilityBundle, ScheduledOccurrence, SchedulingSemanticHints } from './types';

const activities = activitiesJson as unknown as Activity[];
const availability = availabilityJson as unknown as AvailabilityBundle;
const hints = hintsJson as unknown as SchedulingSemanticHints;
const byId = new Map(activities.map((a) => [a.id, a]));
const { result } = scheduleTemporal(activities, availability, hints);
const effective = (o: ScheduledOccurrence): Activity | undefined => byId.get(o.effectiveActivityId ?? o.sourceActivityId);

describe('fixture realism (025)', () => {
  it('G1: no "breakfast" food is scheduled at or after 11:00', () => {
    const late = result.occurrences
      .filter((o) => o.status !== 'skipped' && o.startTime)
      .filter((o) => {
        const a = effective(o);
        return a?.type === 'food' && /breakfast/i.test(a.title) && o.startTime! >= '11:00';
      })
      .map((o) => `${o.date} ${o.startTime} ${o.title}`);
    expect(late).toEqual([]);
  });

  it('G2: fitness admin/readiness tasks resolve to low intensity (not moderate training load)', () => {
    const adminTitles = [
      'Pulse Oximeter Readiness Check',
      'Wearable Readiness Sync',
      'Deload Readiness Check',
      'Monthly Training Adherence Report',
      'Technique Video Review',
    ];
    for (const title of adminTitles) {
      const a = activities.find((x) => x.title === title);
      expect(a, `fixture should contain "${title}"`).toBeDefined();
      const intensity = a!.temporalPolicy?.intensity ?? getDefaultTemporalPolicy(a!).intensity;
      expect(intensity, `"${title}" should be low-intensity`).toBe('low');
    }
  });
});
