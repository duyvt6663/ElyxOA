/**
 * DECISION RECAP — 005 Build Scheduler Engine (test plan)
 *
 * Ten tests (it.todo placeholders) covering the locked decisions. Intent per test:
 *
 *  1. schedules-with-no-conflicts
 *     Baseline: with no travel / equipment outages / clinician gaps, every
 *     expanded slot becomes status='scheduled' on its expected date.
 *
 *  2. skips-in-person-during-travel
 *     An activity with canBeRemote=false during a travel range yields
 *     status='skipped' (no backup chain).
 *
 *  3. substitutes-to-remote-during-travel
 *     An activity with canBeRemote=true during travel produces a 'scheduled'
 *     occurrence with isRemote=true, location='remote', physical equipment
 *     bypassed, but clinician (if required) still consumed.
 *
 *  4. uses-backup-when-equipment-under-maintenance
 *     Primary blocked by equipment-blocked range. First feasible backup in
 *     backupActivityIds is chosen; status='substituted', effectiveActivityId =
 *     backup.id.
 *
 *  5. schedules-consult-only-in-narrow-specialist-window
 *     Specialist only available in a narrow date range; expanded slots outside
 *     that range get skipped, slots inside get scheduled.
 *
 *  6. skips-during-allied-health-leave-gap
 *     Allied health clinician's leave gap blocks otherwise-feasible dates;
 *     status='skipped' with reason naming the clinician.
 *
 *  7. skips-when-backup-chain-exhausted
 *     Primary infeasible, every backup also infeasible -> status='skipped'
 *     carries skipAdjustment + reason summarizing the chain.
 *
 *  8. is-deterministic
 *     Running schedule() twice on identical input yields byte-identical
 *     ScheduleResult (deep-equal + JSON.stringify equal).
 *
 *  9. enforces-exclusive-resource-capacity
 *     Two activities competing for the same resource on the same date: the
 *     higher-priority one (compareSlots winner) gets it; the other falls back
 *     to its backup or skips.
 *
 * 10. does-not-expand-backup-only-templates
 *     An activity with isBackupOnly=true is never expanded as a primary; it
 *     only appears as effectiveActivityId via a backupActivityIds reference.
 */

import { describe, it, expect } from 'vitest';
import activitiesFixture from '@/data/activities.json';
import availabilityFixture from '@/data/availability.json';
import { ALLIED_HEALTH_ROLES, EQUIPMENT_ROLES, SPECIALIST_ROLES } from './roles';
import { schedule, scheduleWithDiagnostics } from './scheduler';
import { isActivity, isAvailabilityBundle } from './validate';
import type { Activity, ActivityType, AvailabilityBundle, ResourceRequirement } from '@/lib/types';

describe('schedule', () => {
  function makeActivity(
    overrides: Partial<Activity> & Pick<Activity, 'id' | 'type' | 'title' | 'frequency' | 'priority'>,
  ): Activity {
    return {
      details: '',
      durationMinutes: 30,
      facilitatorLabel: 'Self',
      locations: ['Home'],
      canBeRemote: false,
      prep: [],
      resources: [],
      backupActivityIds: [],
      skipAdjustment: 'skip',
      metrics: [],
      isBackupOnly: false,
      ...overrides,
    };
  }

  function makeAvailability(overrides: Partial<AvailabilityBundle> = {}): AvailabilityBundle {
    return {
      windowStart: '2026-06-01',
      windowEnd: '2026-06-14',
      timeZone: 'America/Los_Angeles',
      memberBusy: [],
      travel: [],
      equipment: [],
      specialists: [],
      alliedHealth: [],
      ...overrides,
    };
  }

  it('schedules with no conflicts', () => {
    const act = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Treadmill run',
      frequency: { count: 3, period: 'week' },
      priority: 1,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const av = makeAvailability({
      equipment: [{ id: 'eq-treadmill-01', role: 'treadmill', label: 'Treadmill', blocked: [] }],
    });

    const result = schedule([act], av);

    expect(result.occurrences).toHaveLength(6);
    for (const occ of result.occurrences) {
      expect(occ.status).toBe('scheduled');
      expect(occ.boundResources.map((b) => b.id)).toContain('eq-treadmill-01');
    }
  });

  it('skips in-person during travel', () => {
    const act = makeActivity({
      id: 'act-sauna',
      type: 'therapy',
      title: 'Sauna session',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      canBeRemote: false,
      resources: [{ kind: 'equipment', role: 'sauna' }],
    });
    const av = makeAvailability({
      equipment: [{ id: 'eq-sauna-01', role: 'sauna', label: 'Sauna', blocked: [] }],
      travel: [
        {
          id: 'tp-1',
          destination: 'Tokyo',
          blocked: [{ start: '2026-06-08', end: '2026-06-12' }],
        },
      ],
    });

    const result = schedule([act], av);

    expect(result.occurrences).toHaveLength(2);
    const jun1 = result.occurrences.find((o) => o.date === '2026-06-01');
    const jun8 = result.occurrences.find((o) => o.date === '2026-06-08');
    expect(jun1?.status).toBe('scheduled');
    expect(jun8?.status).toBe('skipped');
    expect(jun8?.skipAdjustment).toBeDefined();
  });

  it('substitutes to remote during travel', () => {
    const primary = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Treadmill run',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      canBeRemote: false,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
      backupActivityIds: ['act-bk'],
    });
    const backup = makeActivity({
      id: 'act-bk',
      type: 'fitness',
      title: 'Bodyweight circuit',
      frequency: { count: 1, period: 'week' },
      priority: 99,
      canBeRemote: true,
      isBackupOnly: true,
    });
    const av = makeAvailability({
      equipment: [{ id: 'eq-treadmill-01', role: 'treadmill', label: 'Treadmill', blocked: [] }],
      travel: [
        {
          id: 'tp-1',
          destination: 'Tokyo',
          blocked: [{ start: '2026-06-08', end: '2026-06-12' }],
        },
      ],
    });

    const result = schedule([primary, backup], av);

    expect(result.occurrences).toHaveLength(2);
    const jun1 = result.occurrences.find((o) => o.date === '2026-06-01');
    const jun8 = result.occurrences.find((o) => o.date === '2026-06-08');
    expect(jun1?.status).toBe('scheduled');
    expect(jun8?.status).toBe('substituted');
    expect(jun8?.effectiveActivityId).toBe('act-bk');
    expect(jun8?.isRemote).toBe(true);
    expect(jun8?.location).toBe('remote');
  });

  it('uses backup when equipment under maintenance', () => {
    const primary = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Treadmill run',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
      backupActivityIds: ['act-bk'],
    });
    const backup = makeActivity({
      id: 'act-bk',
      type: 'fitness',
      title: 'Rowing',
      frequency: { count: 1, period: 'week' },
      priority: 99,
      isBackupOnly: true,
      resources: [{ kind: 'equipment', role: 'rower' }],
    });
    const av = makeAvailability({
      equipment: [
        {
          id: 'eq-treadmill-01',
          role: 'treadmill',
          label: 'Treadmill',
          blocked: [{ start: '2026-06-08', end: '2026-06-08' }],
        },
        { id: 'eq-rower-01', role: 'rower', label: 'Rower', blocked: [] },
      ],
    });

    const result = schedule([primary, backup], av);

    const jun1 = result.occurrences.find((o) => o.date === '2026-06-01');
    const jun8 = result.occurrences.find((o) => o.date === '2026-06-08');
    expect(jun1?.status).toBe('scheduled');
    expect(jun8?.status).toBe('substituted');
    expect(jun8?.effectiveActivityId).toBe('act-bk');
    expect(jun8?.boundResources.map((b) => b.id)).toContain('eq-rower-01');
  });

  it('schedules consult only in narrow specialist window', () => {
    const act = makeActivity({
      id: 'act-cardio',
      type: 'consultation',
      title: 'Cardiologist check-in',
      frequency: { count: 1, period: 'month' },
      priority: 1,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-08-31',
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [
            { start: '2026-07-01', end: '2026-07-03' },
            { start: '2026-08-01', end: '2026-08-03' },
          ],
        },
      ],
    });

    const result = schedule([act], av);

    expect(result.occurrences).toHaveLength(3);
    const jun1 = result.occurrences.find((o) => o.date === '2026-06-01');
    const jul1 = result.occurrences.find((o) => o.date === '2026-07-01');
    const aug1 = result.occurrences.find((o) => o.date === '2026-08-01');
    expect(jun1?.status).toBe('skipped');
    expect(jul1?.status).toBe('scheduled');
    expect(jul1?.boundResources.map((b) => b.id)).toContain('sp-cardiologist-01');
    expect(aug1?.status).toBe('scheduled');
  });

  it('skips during allied-health leave gap', () => {
    const act = makeActivity({
      id: 'act-physio',
      type: 'therapy',
      title: 'Physio session',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      canBeRemote: false,
      resources: [{ kind: 'alliedHealth', role: 'physiotherapist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-21',
      alliedHealth: [
        {
          id: 'ah-physio-01',
          role: 'physiotherapist',
          discipline: 'physiotherapy',
          name: 'Alex',
          available: [
            { start: '2026-06-01', end: '2026-06-07' },
            { start: '2026-06-15', end: '2026-06-21' },
          ],
        },
      ],
    });

    const result = schedule([act], av);

    const jun1 = result.occurrences.find((o) => o.date === '2026-06-01');
    const jun8 = result.occurrences.find((o) => o.date === '2026-06-08');
    const jun15 = result.occurrences.find((o) => o.date === '2026-06-15');
    expect(jun1?.status).toBe('scheduled');
    expect(jun8?.status).toBe('skipped');
    expect(jun15?.status).toBe('scheduled');
  });

  it('skips when backup chain exhausted', () => {
    const primary = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Treadmill run',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      canBeRemote: false,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
      backupActivityIds: ['act-bk'],
      skipAdjustment: 'rest day',
    });
    const backup = makeActivity({
      id: 'act-bk',
      type: 'fitness',
      title: 'Rowing',
      frequency: { count: 1, period: 'week' },
      priority: 99,
      canBeRemote: false,
      isBackupOnly: true,
      resources: [{ kind: 'equipment', role: 'rower' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [
        {
          id: 'eq-treadmill-01',
          role: 'treadmill',
          label: 'Treadmill',
          blocked: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
        {
          id: 'eq-rower-01',
          role: 'rower',
          label: 'Rower',
          blocked: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
    });

    const result = schedule([primary, backup], av);

    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]!.date).toBe('2026-06-01');
    expect(result.occurrences[0]!.status).toBe('skipped');
    expect(result.occurrences[0]!.skipAdjustment).toBe('rest day');
  });

  it('is deterministic', () => {
    const fitness = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Treadmill run',
      frequency: { count: 3, period: 'week' },
      priority: 1,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const consult = makeActivity({
      id: 'act-consult',
      type: 'consultation',
      title: 'Cardio check',
      frequency: { count: 1, period: 'month' },
      priority: 2,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const med = makeActivity({
      id: 'act-med',
      type: 'medication',
      title: 'Daily vitamin',
      frequency: { count: 1, period: 'day' },
      priority: 3,
    });

    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [{ id: 'eq-treadmill-01', role: 'treadmill', label: 'Treadmill', blocked: [] }],
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
    });

    const original = [fitness, consult, med];
    const a = schedule(original, av);
    const b = schedule(original, av);
    expect(a).toEqual(b);

    const shuffled = [...original].reverse();
    expect(schedule(shuffled, av)).toEqual(schedule(original, av));
  });

  it('enforces exclusive resource capacity', () => {
    const actA = makeActivity({
      id: 'act-A',
      type: 'consultation',
      title: 'Cardio A',
      frequency: { count: 1, period: 'month' },
      priority: 1,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const actB = makeActivity({
      id: 'act-B',
      type: 'consultation',
      title: 'Cardio B',
      frequency: { count: 1, period: 'month' },
      priority: 2,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
      backupActivityIds: ['act-bk'],
    });
    const backup = makeActivity({
      id: 'act-bk',
      type: 'consultation',
      title: 'Remote check-in',
      frequency: { count: 1, period: 'month' },
      priority: 99,
      canBeRemote: true,
      isBackupOnly: true,
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-01',
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-06-01', end: '2026-06-01' }],
        },
      ],
    });

    const result = schedule([actA, actB, backup], av);

    const a = result.occurrences.find((o) => o.sourceActivityId === 'act-A');
    const b = result.occurrences.find((o) => o.sourceActivityId === 'act-B');
    expect(a?.status).toBe('scheduled');
    expect(a?.boundResources.map((r) => r.id)).toContain('sp-cardiologist-01');
    expect(b?.status).toBe('substituted');
    expect(b?.effectiveActivityId).toBe('act-bk');

    let cardioBindings = 0;
    for (const occ of result.occurrences) {
      for (const br of occ.boundResources) {
        if (br.id === 'sp-cardiologist-01') cardioBindings += 1;
      }
    }
    expect(cardioBindings).toBe(1);
  });

  it('does not expand backup-only templates', () => {
    const primary = makeActivity({
      id: 'act-primary',
      type: 'fitness',
      title: 'Weekly run',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      backupActivityIds: ['act-bk'],
    });
    const backup = makeActivity({
      id: 'act-bk',
      type: 'fitness',
      title: 'Daily bodyweight',
      frequency: { count: 1, period: 'day' },
      priority: 99,
      isBackupOnly: true,
    });
    const av = makeAvailability();

    const result = schedule([primary, backup], av);

    expect(result.occurrences).toHaveLength(2);
    for (const occ of result.occurrences) {
      expect(occ.sourceActivityId).toBe('act-primary');
      expect(occ.status).toBe('scheduled');
    }
  });

  // === 012: AllocationTrace tests ===
  it('traces parallel ScheduleResult.occurrences by id', () => {
    // 012: lockstep invariant — traces[i].occurrenceId === occurrences[i].id post-sort.
    const fit = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Run',
      frequency: { count: 2, period: 'week' },
      priority: 1,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const med = makeActivity({
      id: 'act-med',
      type: 'medication',
      title: 'Vitamin',
      frequency: { count: 1, period: 'day' },
      priority: 2,
    });
    const consult = makeActivity({
      id: 'act-consult',
      type: 'consultation',
      title: 'Cardio',
      frequency: { count: 1, period: 'month' },
      priority: 3,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [{ id: 'eq-treadmill-01', role: 'treadmill', label: 'Treadmill', blocked: [] }],
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
    });

    const { result, diagnostics } = scheduleWithDiagnostics([fit, med, consult], av);

    expect(diagnostics.traces).toHaveLength(result.occurrences.length);
    for (let i = 0; i < result.occurrences.length; i++) {
      expect(diagnostics.traces[i]!.occurrenceId).toBe(result.occurrences[i]!.id);
    }
  });

  it('chosenIndex points to feasible attempt for scheduled/substituted; null for skipped', () => {
    // 012: scheduled fitness + substituted (primary equipment blocked, backup ok)
    // + skipped (no backup, primary blocked) in one fixture.
    const scheduledAct = makeActivity({
      id: 'act-sched',
      type: 'fitness',
      title: 'Walk',
      frequency: { count: 1, period: 'week' },
      priority: 1,
    });
    const subPrimary = makeActivity({
      id: 'act-sub-pri',
      type: 'fitness',
      title: 'Treadmill',
      frequency: { count: 1, period: 'week' },
      priority: 2,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
      backupActivityIds: ['act-sub-bk'],
    });
    const subBackup = makeActivity({
      id: 'act-sub-bk',
      type: 'fitness',
      title: 'Rower',
      frequency: { count: 1, period: 'week' },
      priority: 50,
      isBackupOnly: true,
      resources: [{ kind: 'equipment', role: 'rower' }],
    });
    const skippedAct = makeActivity({
      id: 'act-skip',
      type: 'consultation',
      title: 'Cardio',
      frequency: { count: 1, period: 'week' },
      priority: 3,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [
        {
          id: 'eq-treadmill-01',
          role: 'treadmill',
          label: 'Treadmill',
          blocked: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
        { id: 'eq-rower-01', role: 'rower', label: 'Rower', blocked: [] },
      ],
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-07-01', end: '2026-07-31' }], // outside window -> skip
        },
      ],
    });

    const { diagnostics } = scheduleWithDiagnostics(
      [scheduledAct, subPrimary, subBackup, skippedAct],
      av,
    );

    const schedTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-sched')!;
    const subTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-sub-pri')!;
    const skipTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-skip')!;

    expect(schedTrace.status).toBe('scheduled');
    expect(schedTrace.chosenIndex).not.toBeNull();
    expect(schedTrace.attempts[schedTrace.chosenIndex!]!.feasible).toBe(true);

    expect(subTrace.status).toBe('substituted');
    expect(subTrace.chosenIndex).not.toBeNull();
    expect(subTrace.attempts[subTrace.chosenIndex!]!.feasible).toBe(true);
    expect(subTrace.chosenIndex).toBeGreaterThan(0); // backup, not primary

    expect(skipTrace.status).toBe('skipped');
    expect(skipTrace.chosenIndex).toBeNull();
  });

  it('failedConstraints[].kind matches the asymmetric model (travel/equipment/specialist/alliedHealth/remoteRequired)', () => {
    // 012: one fixture exercising all 5 kinds. Decision: when member is away and
    // canBeRemote=false we emit BOTH `travel` and `remoteRequired` so consumers
    // can disambiguate "would have worked remote" from "in-person blocked by travel".
    const travelInPerson = makeActivity({
      id: 'act-tv',
      type: 'therapy',
      title: 'Massage',
      frequency: { count: 1, period: 'week' },
      priority: 1,
      canBeRemote: false,
    });
    const equipmentAct = makeActivity({
      id: 'act-eq',
      type: 'fitness',
      title: 'Run',
      frequency: { count: 1, period: 'week' },
      priority: 2,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const specialistAct = makeActivity({
      id: 'act-sp',
      type: 'consultation',
      title: 'Cardio',
      frequency: { count: 1, period: 'week' },
      priority: 3,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const alliedAct = makeActivity({
      id: 'act-ah',
      type: 'therapy',
      title: 'Physio',
      frequency: { count: 1, period: 'week' },
      priority: 4,
      resources: [{ kind: 'alliedHealth', role: 'physiotherapist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      travel: [{ id: 'tp-1', destination: 'Tokyo', blocked: [{ start: '2026-06-01', end: '2026-06-07' }] }],
      equipment: [
        {
          id: 'eq-treadmill-01',
          role: 'treadmill',
          label: 'Treadmill',
          blocked: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-07-01', end: '2026-07-07' }], // outside window
        },
      ],
      alliedHealth: [
        {
          id: 'ah-physio-01',
          role: 'physiotherapist',
          discipline: 'physiotherapy',
          name: 'Alex',
          available: [{ start: '2026-07-01', end: '2026-07-07' }], // outside window — leave
        },
      ],
    });

    const { diagnostics } = scheduleWithDiagnostics(
      [travelInPerson, equipmentAct, specialistAct, alliedAct],
      av,
    );

    // travelInPerson: member away + !canBeRemote → primary attempt emits travel + remoteRequired.
    const travelTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-tv')!;
    const travelKinds = travelTrace.attempts[0]!.failedConstraints.map((f) => f.kind);
    expect(travelKinds).toContain('travel');
    expect(travelKinds).toContain('remoteRequired');

    // equipmentAct: no available equipment for treadmill role.
    const eqTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-eq')!;
    // Note: this activity is also in a travel window — when away+canBeRemote=false
    // the travel/remoteRequired pair fires FIRST (short-circuit) so the equipment
    // kind only surfaces if we make the activity remote-capable. Verify equipment
    // kind via a second tiny check:
    const eqOnlyAct = makeActivity({
      id: 'act-eq-only',
      type: 'fitness',
      title: 'Run',
      frequency: { count: 1, period: 'week' },
      priority: 10,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const eqOnlyAv = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [
        {
          id: 'eq-treadmill-01',
          role: 'treadmill',
          label: 'Treadmill',
          blocked: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
    });
    const eqOnly = scheduleWithDiagnostics([eqOnlyAct], eqOnlyAv);
    const eqOnlyTrace = eqOnly.diagnostics.traces[0]!;
    expect(eqOnlyTrace.attempts[0]!.failedConstraints[0]!.kind).toBe('equipment');
    expect(eqOnlyTrace.attempts[0]!.failedConstraints[0]!.role).toBe('treadmill');
    void eqTrace; // keep both fixtures referenced

    // specialistAct: narrow window misses → specialist kind.
    const spTrace = diagnostics.traces.find((t) => t.sourceActivityId === 'act-sp')!;
    const spKinds = spTrace.attempts[0]!.failedConstraints.map((f) => f.kind);
    // travel+remoteRequired pair fires first; specialist would fire if canBeRemote=true.
    // Verify via small re-run with remote-capable activity outside travel:
    const spRemote = makeActivity({
      id: 'act-sp-r',
      type: 'consultation',
      title: 'Cardio',
      frequency: { count: 1, period: 'week' },
      priority: 11,
      canBeRemote: true,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const spAv = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-07-01', end: '2026-07-07' }],
        },
      ],
    });
    const spRun = scheduleWithDiagnostics([spRemote], spAv);
    expect(spRun.diagnostics.traces[0]!.attempts[0]!.failedConstraints[0]!.kind).toBe('specialist');
    expect(spRun.diagnostics.traces[0]!.attempts[0]!.failedConstraints[0]!.role).toBe('cardiologist');
    void spKinds;

    // alliedAct similarly — verify via isolated fixture.
    const ahRemote = makeActivity({
      id: 'act-ah-r',
      type: 'therapy',
      title: 'Physio',
      frequency: { count: 1, period: 'week' },
      priority: 12,
      canBeRemote: true,
      resources: [{ kind: 'alliedHealth', role: 'physiotherapist' }],
    });
    const ahAv = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      alliedHealth: [
        {
          id: 'ah-physio-01',
          role: 'physiotherapist',
          discipline: 'physiotherapy',
          name: 'Alex',
          available: [{ start: '2026-07-01', end: '2026-07-07' }],
        },
      ],
    });
    const ahRun = scheduleWithDiagnostics([ahRemote], ahAv);
    expect(ahRun.diagnostics.traces[0]!.attempts[0]!.failedConstraints[0]!.kind).toBe('alliedHealth');
    expect(ahRun.diagnostics.traces[0]!.attempts[0]!.failedConstraints[0]!.role).toBe('physiotherapist');

    // Final asymmetric-model assertion: at least one trace has kind === 'travel' for the in-person travel-block scenario.
    expect(
      diagnostics.traces.some((t) =>
        t.attempts.some((a) => a.failedConstraints.some((f) => f.kind === 'travel')),
      ),
    ).toBe(true);
  });

  it('exclusive capacity contention surfaces in diagnostics as a constraint failure', () => {
    // 012: two activities competing for the same specialist on the same date.
    // Priority 1 wins the booking; priority 2 must fail with a specialist
    // failedConstraint whose resourceId matches the contended resource.
    const actA = makeActivity({
      id: 'act-A',
      type: 'consultation',
      title: 'Cardio A',
      frequency: { count: 1, period: 'month' },
      priority: 1,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const actB = makeActivity({
      id: 'act-B',
      type: 'consultation',
      title: 'Cardio B',
      frequency: { count: 1, period: 'month' },
      priority: 2,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-01',
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-06-01', end: '2026-06-01' }],
        },
      ],
    });

    const { diagnostics } = scheduleWithDiagnostics([actA, actB], av);

    const traceA = diagnostics.traces.find((t) => t.sourceActivityId === 'act-A')!;
    const traceB = diagnostics.traces.find((t) => t.sourceActivityId === 'act-B')!;

    expect(traceA.status).toBe('scheduled');
    expect(traceA.attempts[0]!.boundResources.some((b) => b.id === 'sp-cardiologist-01')).toBe(true);

    const bFailed = traceB.attempts.find((a) => !a.feasible);
    expect(bFailed).toBeDefined();
    expect(
      bFailed!.failedConstraints.some(
        (f) => f.kind === 'specialist' && f.resourceId === 'sp-cardiologist-01',
      ),
    ).toBe(true);
  });

  it('scheduleWithDiagnostics(...).result is deeply equal to schedule(...) for the same input', () => {
    // 012: parity invariant — diagnostics emission must not perturb the result shape.
    const fit = makeActivity({
      id: 'act-fit',
      type: 'fitness',
      title: 'Run',
      frequency: { count: 3, period: 'week' },
      priority: 1,
      resources: [{ kind: 'equipment', role: 'treadmill' }],
    });
    const consult = makeActivity({
      id: 'act-consult',
      type: 'consultation',
      title: 'Cardio',
      frequency: { count: 1, period: 'month' },
      priority: 2,
      resources: [{ kind: 'specialist', role: 'cardiologist' }],
    });
    const med = makeActivity({
      id: 'act-med',
      type: 'medication',
      title: 'Vitamin',
      frequency: { count: 1, period: 'day' },
      priority: 3,
    });
    const av = makeAvailability({
      windowStart: '2026-06-01',
      windowEnd: '2026-06-07',
      equipment: [{ id: 'eq-treadmill-01', role: 'treadmill', label: 'Treadmill', blocked: [] }],
      specialists: [
        {
          id: 'sp-cardiologist-01',
          role: 'cardiologist',
          name: 'Dr. Heart',
          available: [{ start: '2026-06-01', end: '2026-06-07' }],
        },
      ],
    });

    expect(scheduleWithDiagnostics([fit, consult, med], av).result).toEqual(
      schedule([fit, consult, med], av),
    );
  });
});

describe('activities fixture', () => {
  const activities = activitiesFixture as unknown as Activity[];

  it('matches the canonical schema and primary distribution', () => {
    expect(Array.isArray(activitiesFixture)).toBe(true);
    expect((activitiesFixture as unknown[]).every(isActivity)).toBe(true);

    const primary = activities.filter((activity) => !activity.isBackupOnly);
    expect(primary).toHaveLength(102);

    const counts: Record<ActivityType, number> = {
      fitness: 0,
      food: 0,
      medication: 0,
      therapy: 0,
      consultation: 0,
    };
    for (const activity of primary) counts[activity.type] += 1;
    expect(counts).toEqual({
      fitness: 28,
      food: 24,
      medication: 22,
      therapy: 16,
      consultation: 12,
    });

    const ids = new Set(activities.map((activity) => activity.id));
    expect(ids.size).toBe(activities.length);

    const priorities = activities.map((activity) => activity.priority).sort((a, b) => a - b);
    expect(priorities).toEqual(Array.from({ length: activities.length }, (_, index) => index + 1));
    expect(primary.map((activity) => activity.priority)).toEqual(
      Array.from({ length: 102 }, (_, index) => index + 1),
    );

    const periods = new Set(primary.map((activity) => activity.frequency.period));
    expect(periods).toEqual(new Set(['day', 'week', 'month', 'year']));
  });

  it('keeps backup chains and resource roles valid', () => {
    const byId = new Map(activities.map((activity) => [activity.id, activity]));

    const hasValidRole = (resource: ResourceRequirement): boolean => {
      if (resource.kind === 'equipment') return (EQUIPMENT_ROLES as readonly string[]).includes(resource.role);
      if (resource.kind === 'specialist') return (SPECIALIST_ROLES as readonly string[]).includes(resource.role);
      return (ALLIED_HEALTH_ROLES as readonly string[]).includes(resource.role);
    };

    for (const activity of activities) {
      expect(activity.resources.every(hasValidRole)).toBe(true);

      for (const backupId of activity.backupActivityIds) {
        const backup = byId.get(backupId);
        expect(backup).toBeDefined();
        expect(backup?.type).toBe(activity.type);
      }

      if (activity.backupActivityIds.length === 0) continue;

      let cursor = activity;
      const seen = new Set([cursor.id]);
      while (cursor.backupActivityIds.length > 0) {
        const nextId = cursor.backupActivityIds[cursor.backupActivityIds.length - 1]!;
        const next = byId.get(nextId);
        if (!next) throw new Error(`Missing backup ${nextId}`);
        if (seen.has(next.id)) throw new Error(`Backup cycle at ${next.id}`);
        seen.add(next.id);
        cursor = next;
      }
      expect(cursor.resources).toHaveLength(0);
    }
  });

  it('schedules against the canonical availability and exercises all outcomes', () => {
    expect(isAvailabilityBundle(availabilityFixture)).toBe(true);

    const result = schedule(activities, availabilityFixture as unknown as AvailabilityBundle);
    const statuses = new Set(result.occurrences.map((occurrence) => occurrence.status));

    expect(result.occurrences.length).toBeGreaterThan(1000);
    expect(statuses).toEqual(new Set(['scheduled', 'substituted', 'skipped']));
    expect(
      result.occurrences.some(
        (occurrence) =>
          occurrence.sourceActivityId === 'act-003' &&
          occurrence.date === '2026-06-01' &&
          occurrence.status === 'skipped',
      ),
    ).toBe(true);
  });
});
