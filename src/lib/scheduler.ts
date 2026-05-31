/**
 * DECISION RECAP — 005 Build Scheduler Engine
 * - Pure runtime-agnostic deterministic function. No Date.now, no Math.random, no I/O.
 * - Algorithm: EXPAND -> ORDER -> ALLOCATE -> COMMIT -> ASSEMBLE -> SORT.
 * - Frequency expansion (window-anchored, whole-day granularity):
 *     day/1 = every day; day/n>1 collapses to 1/day.
 *     week/1 = Monday of each week (clamped to windowStart).
 *     week/n slot map: n=2 [Mon,Thu]; n=3 [Mon,Wed,Fri]; n=4 [Mon,Tue,Thu,Fri];
 *                      n=5 [Mon-Fri]; n=6 [Mon-Sat]; n=7 [Mon-Sun].
 *     month/1 = 1st of each month (clamped).
 *     month/n>1 = floor(1 + k*(28/n)) for k=0..n-1.
 *     year/1 = windowStart. year/n>1 = windowStart + round(k*(len(W)-1)/(n-1)) for k=0..n-1.
 *     Out-of-window dates DROPPED (not shifted).
 * - Constraint semantics (asymmetric):
 *     Travel blocked => member away => in-person blocked; remote allowed iff
 *       activity.canBeRemote (sets isRemote=true, location='remote').
 *     Equipment: usable unless `date` in any blocked range; remote-from-travel
 *       bypasses physical equipment + location.
 *     Specialist/AlliedHealth: bookable ONLY inside `available` ranges. Remote
 *       does NOT bypass (clinician calendar still consumes).
 * - Capacity: EXCLUSIVE — one booking per resource per day (equipment, specialists,
 *   allied). Per-day ledger.
 * - Backup chain: walk activity.backupActivityIds in order; first feasible ->
 *   'substituted' (effectiveActivityId = backup id). Exhausted -> 'skipped' with
 *   skipAdjustment + reason text.
 * - isBackupOnly=true templates NEVER expanded as primary; only reachable via a
 *   backupActivityIds reference.
 * - Determinism: total order over slots = (priority asc, activityId asc, date asc).
 *   Identical input -> byte-identical output.
 */

/**
 * PSEUDO-ALGORITHM
 * 1. EXPAND: for each activity where !isBackupOnly, run expandFrequency(activity,
 *    windowStart, windowEnd) to produce candidate dates. Build slot tuples
 *    { activity, date }.
 * 2. ORDER: sort all slots by compareSlots (priority asc, activityId asc, date asc).
 * 3. ALLOCATE: iterate slots; for each call allocate(slot, activitiesById, ledger,
 *    availability). allocate tries the primary activity via isFeasible, then walks
 *    backupActivityIds in order. First feasible candidate wins.
 * 4. COMMIT: when allocate finds a feasible candidate, write its bound resources
 *    into the per-day ledger (one booking per resource per day).
 * 5. ASSEMBLE: collect every ScheduledOccurrence returned by allocate (scheduled,
 *    substituted, or skipped).
 * 6. SORT: emit occurrences sorted by (date asc, sourceActivityId asc) so the
 *    output is byte-identical for identical inputs. Return ScheduleResult.
 */

/**
 * DECISION RECAP — 012 Scheduler Diagnostics (sibling)
 * - Adds scheduleWithDiagnostics(): returns ScheduleDebugResult = { result, diagnostics }.
 * - schedule(...) signature UNCHANGED; byte-identical output preserved for 010/UI consumers.
 * - Full trace per attempt; ~50 KB JSON budget at the 102-activity scale (accepted).
 * - Diagnostics built in lockstep with allocation via a parallel `traces[]` accumulator.
 */

import type {
  Activity,
  AllocationAttempt,
  AllocationTrace,
  AvailabilityBundle,
  BoundResource,
  FailedConstraint,
  ScheduleDebugResult,
  ScheduleResult,
  ScheduledOccurrence,
} from '@/lib/types';

/**
 * PerDayLedger
 * Maps a YYYY-MM-DD date -> set of resourceIds already booked that day.
 * Resources are EXCLUSIVE: equipment / specialist / allied-health all share the
 * same booking namespace (resourceId). One booking per resource per day.
 */
export type PerDayLedger = Map<string /* date YYYY-MM-DD */, Set<string /* resourceId */>>;

/**
 * FeasibilityResult — output of isFeasible.
 * On success: includes the BoundResource[] to commit and the resolved
 *   isRemote/location for the occurrence.
 * On failure: includes a human-readable reason used in skipAdjustment when the
 *   backup chain is exhausted.
 */
export type FeasibilityResult =
  | { feasible: true; boundResources: BoundResource[]; isRemote: boolean; location: string }
  | { feasible: false; reason: string; failedConstraints: FailedConstraint[] };

// ---------- Internal date helpers (UTC-only) ----------

export function parseYMD(s: string): { y: number; m: number; d: number } {
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) };
}

function formatYMD(y: number, m: number, d: number): string {
  const mm = m < 10 ? `0${m}` : `${m}`;
  const dd = d < 10 ? `0${d}` : `${d}`;
  return `${y}-${mm}-${dd}`;
}

function weekdayOfYMD(s: string): number {
  const { y, m, d } = parseYMD(s);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function addDaysYMD(s: string, n: number): string {
  const { y, m, d } = parseYMD(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return formatYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetweenYMD(a: string, b: string): number {
  const pa = parseYMD(a);
  const pb = parseYMD(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86400000);
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * PSEUDO-ALGORITHM (schedule)
 * 1. Initialize empty PerDayLedger and activitiesById map.
 * 2. EXPAND every non-backup-only activity into slots.
 * 3. ORDER slots via compareSlots.
 * 4. ALLOCATE each slot via allocate(), accumulating ScheduledOccurrence list.
 * 5. SORT occurrences by (date asc, sourceActivityId asc).
 * 6. Return { windowStart, windowEnd, occurrences }.
 */
export function schedule(
  activities: Activity[],
  availability: AvailabilityBundle,
): ScheduleResult {
  // 012: delegate to scheduleWithDiagnostics and discard the diagnostics payload.
  // ScheduleResult shape is preserved byte-identically.
  return scheduleWithDiagnostics(activities, availability).result;
}

/**
 * PSEUDO-ALGORITHM (expandFrequency)
 * Given activity.frequency = { period, count } and the window [windowStart, windowEnd]:
 *  - day/1: emit every date in window.
 *  - day/n>1: collapse to 1/day (same as day/1) — whole-day granularity.
 *  - week/1: emit Monday of each ISO week in the window, clamped so the first
 *    emitted date is max(weekMonday, windowStart).
 *  - week/n: use weekday slot map
 *      n=2 [Mon,Thu] | n=3 [Mon,Wed,Fri] | n=4 [Mon,Tue,Thu,Fri]
 *      n=5 [Mon-Fri] | n=6 [Mon-Sat]     | n=7 [Mon-Sun]
 *    For each week in window, emit the listed weekdays.
 *  - month/1: emit the 1st of each month in window (clamped to windowStart).
 *  - month/n>1: for each month, emit days at offsets floor(1 + k*(28/n)) for
 *    k=0..n-1.
 *  - year/1: emit windowStart.
 *  - year/n>1: emit windowStart + round(k*(len(W)-1)/(n-1)) days for k=0..n-1,
 *    where len(W) is the inclusive day count of the window.
 * Drop any date that falls outside [windowStart, windowEnd]. Do NOT shift.
 * Return YYYY-MM-DD strings in ascending order, no duplicates.
 */
export function expandFrequency(
  activity: Activity,
  windowStart: string,
  windowEnd: string,
): string[] {
  const { period, count } = activity.frequency;
  const out: string[] = [];

  if (period === 'day') {
    let cur = windowStart;
    while (cur <= windowEnd) {
      out.push(cur);
      cur = addDaysYMD(cur, 1);
    }
    return out;
  }

  if (period === 'week') {
    const slotMap: Record<number, number[]> = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 5],
      5: [1, 2, 3, 4, 5],
      6: [1, 2, 3, 4, 5, 6],
      7: [1, 2, 3, 4, 5, 6, 7],
    };
    const allowed = new Set(slotMap[count] ?? [1]);
    let cur = windowStart;
    while (cur <= windowEnd) {
      if (allowed.has(weekdayOfYMD(cur))) out.push(cur);
      cur = addDaysYMD(cur, 1);
    }
    return out;
  }

  if (period === 'month') {
    const startP = parseYMD(windowStart);
    const endP = parseYMD(windowEnd);
    const targets: number[] =
      count <= 1 ? [1] : Array.from({ length: count }, (_, k) => Math.floor(1 + k * (28 / count)));

    let y = startP.y;
    let m = startP.m;
    while (y < endP.y || (y === endP.y && m <= endP.m)) {
      for (const d of targets) {
        const candidate = formatYMD(y, m, d);
        if (candidate >= windowStart && candidate <= windowEnd) out.push(candidate);
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    out.sort();
    return out;
  }

  // year
  if (count <= 1) {
    out.push(windowStart);
    return out;
  }
  const totalDays = daysBetweenYMD(windowStart, windowEnd) + 1;
  for (let k = 0; k < count; k++) {
    const offset = Math.round((k * (totalDays - 1)) / (count - 1));
    const candidate = addDaysYMD(windowStart, offset);
    if (candidate >= windowStart && candidate <= windowEnd) out.push(candidate);
  }
  return out;
}

/**
 * PSEUDO-ALGORITHM (isFeasible)
 * 1. Determine memberAway: true if `date` lies inside any availability.travel range.
 * 2. If memberAway:
 *      - If !activity.canBeRemote -> { feasible: false, reason: 'member traveling' }.
 *      - Else mark isRemote=true, location='remote'; SKIP physical equipment +
 *        physical location requirements when checking ResourceRequirements.
 *    Else isRemote=false, location=activity.defaultLocation (or similar).
 * 3. For each ResourceRequirement on activity:
 *      a. equipment: if isRemote (from travel) skip; else require equipment
 *         availability `date` NOT in any blocked range AND not present in
 *         ledger[date].
 *      b. specialist / alliedHealth: require `date` inside one of the resource's
 *         `available` ranges AND not present in ledger[date]. Remote does NOT
 *         bypass clinician calendars.
 *    If any requirement fails -> { feasible: false, reason: '<which resource>' }.
 * 4. Collect BoundResource[] for every requirement that was satisfied (including
 *    clinicians even when remote). Return { feasible: true, boundResources,
 *    isRemote, location }.
 * NOTE: this function MUST NOT mutate the ledger. allocate() commits.
 */
export function isFeasible(
  activity: Activity,
  date: string,
  ledger: PerDayLedger,
  availability: AvailabilityBundle,
): FeasibilityResult {
  // 012: helper that wraps a failure return so reason text is always derived from
  // failedConstraints (kept byte-identical via `; `-join of detail strings).
  const fail = (failedConstraints: FailedConstraint[]): FeasibilityResult => ({
    feasible: false,
    reason: failedConstraints.map((f) => f.detail).join('; '),
    failedConstraints,
  });

  let isAway = false;
  for (const trip of availability.travel) {
    for (const range of trip.blocked) {
      if (isDateInRange(date, range.start, range.end)) {
        isAway = true;
        break;
      }
    }
    if (isAway) break;
  }

  let isRemote = false;
  let location = activity.locations[0] ?? '';
  if (isAway) {
    if (!activity.canBeRemote) {
      // 012: asymmetric model — emit BOTH `travel` (member provably away) and
      // `remoteRequired` (no remote fallback) so consumers can disambiguate.
      return fail([
        { kind: 'travel', detail: 'member traveling' },
        { kind: 'remoteRequired', detail: 'member traveling and activity is not remote-capable' },
      ]);
    }
    isRemote = true;
    location = 'remote';
  }

  const dayBookings = ledger.get(date);
  const bound: BoundResource[] = [];

  for (const req of activity.resources) {
    if (req.kind === 'equipment') {
      if (isRemote) continue; // physical bypass when remote due to travel
      let chosen: string | null = null;
      for (const eq of availability.equipment) {
        if (eq.role !== req.role) continue;
        if (req.id && eq.id !== req.id) continue;
        let blocked = false;
        for (const r of eq.blocked) {
          if (isDateInRange(date, r.start, r.end)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        if (dayBookings && dayBookings.has(eq.id)) continue;
        chosen = eq.id;
        break;
      }
      if (!chosen) {
        // 012: include the pinned resourceId when the requirement targeted a specific instance.
        const fc: FailedConstraint = {
          kind: 'equipment',
          role: req.role,
          detail: `no available equipment for role ${req.role}`,
        };
        if (req.id) fc.resourceId = req.id;
        return fail([fc]);
      }
      bound.push({ kind: 'equipment', role: req.role, id: chosen });
    } else if (req.kind === 'specialist') {
      let chosen: string | null = null;
      for (const sp of availability.specialists) {
        if (sp.role !== req.role) continue;
        if (req.id && sp.id !== req.id) continue;
        let available = false;
        for (const r of sp.available) {
          if (isDateInRange(date, r.start, r.end)) {
            available = true;
            break;
          }
        }
        if (!available) continue;
        if (dayBookings && dayBookings.has(sp.id)) continue;
        chosen = sp.id;
        break;
      }
      if (!chosen) {
        // 012: if a specific specialist id was pinned and is the cause of the
        // failure, surface it via resourceId; else surface only the role-level miss.
        const fc: FailedConstraint = {
          kind: 'specialist',
          role: req.role,
          detail: `no available specialist for role ${req.role}`,
        };
        if (req.id) fc.resourceId = req.id;
        else {
          // 012: per-resource exclusive-capacity contention — when EVERY specialist
          // matching the role is booked in today's ledger, surface the specific id(s)
          // so diagnostics callers can pinpoint the contention.
          for (const sp of availability.specialists) {
            if (sp.role !== req.role) continue;
            if (dayBookings && dayBookings.has(sp.id)) {
              fc.resourceId = sp.id;
              break;
            }
          }
        }
        return fail([fc]);
      }
      bound.push({ kind: 'specialist', role: req.role, id: chosen });
    } else {
      // alliedHealth
      let chosen: string | null = null;
      for (const ah of availability.alliedHealth) {
        if (ah.role !== req.role) continue;
        if (req.id && ah.id !== req.id) continue;
        let available = false;
        for (const r of ah.available) {
          if (isDateInRange(date, r.start, r.end)) {
            available = true;
            break;
          }
        }
        if (!available) continue;
        if (dayBookings && dayBookings.has(ah.id)) continue;
        chosen = ah.id;
        break;
      }
      if (!chosen) {
        const fc: FailedConstraint = {
          kind: 'alliedHealth',
          role: req.role,
          detail: `no available alliedHealth for role ${req.role}`,
        };
        if (req.id) fc.resourceId = req.id;
        return fail([fc]);
      }
      bound.push({ kind: 'alliedHealth', role: req.role, id: chosen });
    }
  }

  return { feasible: true, boundResources: bound, isRemote, location };
}

/**
 * PSEUDO-ALGORITHM (allocate)
 * 1. Try primary: call isFeasible(slot.activity, slot.date, ledger, availability).
 *    If feasible:
 *      - Commit each BoundResource into ledger[date].
 *      - Return buildOccurrence({ status: 'scheduled', sourceActivityId =
 *        effectiveActivityId = slot.activity.id, ... }).
 * 2. Else walk slot.activity.backupActivityIds in order. For each backupId:
 *      - Look up backup activity via activitiesById; if missing, skip.
 *      - Call isFeasible(backup, slot.date, ledger, availability).
 *      - If feasible: commit ledger, return buildOccurrence({ status:
 *        'substituted', sourceActivityId = slot.activity.id,
 *        effectiveActivityId = backup.id, ... }).
 * 3. If chain exhausted: return buildOccurrence({ status: 'skipped',
 *    sourceActivityId = slot.activity.id, effectiveActivityId = null,
 *    skipAdjustment + reason text describing why each candidate failed }).
 * MUTATES ledger only on success.
 */
export function allocate(
  slot: { activity: Activity; date: string },
  activitiesById: Map<string, Activity>,
  ledger: PerDayLedger,
  availability: AvailabilityBundle,
  traceAccumulator?: AllocationAttempt[],
): ScheduledOccurrence {
  const commit = (bound: BoundResource[]) => {
    let day = ledger.get(slot.date);
    if (!day) {
      day = new Set();
      ledger.set(slot.date, day);
    }
    for (const b of bound) day.add(b.id);
  };

  // 012: helper that records one AllocationAttempt iff a trace accumulator is
  // provided. When undefined, allocate() behaves byte-identically to pre-012.
  const recordAttempt = (candidate: Activity, isPrimary: boolean, pf: FeasibilityResult) => {
    if (!traceAccumulator) return;
    traceAccumulator.push({
      candidateActivityId: candidate.id,
      isPrimary,
      feasible: pf.feasible,
      boundResources: pf.feasible ? pf.boundResources : [],
      failedConstraints: pf.feasible ? [] : pf.failedConstraints,
      isRemote: pf.feasible ? pf.isRemote : undefined,
      location: pf.feasible ? pf.location : undefined,
    });
  };

  const pf = isFeasible(slot.activity, slot.date, ledger, availability);
  recordAttempt(slot.activity, true, pf);
  if (pf.feasible) {
    commit(pf.boundResources);
    return buildOccurrence({
      sourceActivity: slot.activity,
      effectiveActivity: slot.activity,
      date: slot.date,
      status: 'scheduled',
      isRemote: pf.isRemote,
      location: pf.location,
      boundResources: pf.boundResources,
      reason: 'primary scheduled',
    });
  }

  for (const backupId of slot.activity.backupActivityIds) {
    const backup = activitiesById.get(backupId);
    if (!backup) continue;
    const bf = isFeasible(backup, slot.date, ledger, availability);
    recordAttempt(backup, false, bf);
    if (bf.feasible) {
      commit(bf.boundResources);
      return buildOccurrence({
        sourceActivity: slot.activity,
        effectiveActivity: backup,
        date: slot.date,
        status: 'substituted',
        isRemote: bf.isRemote,
        location: bf.location,
        boundResources: bf.boundResources,
        reason: `substituted: ${backup.id} — primary blocked (${pf.reason})`,
      });
    }
  }

  return buildOccurrence({
    sourceActivity: slot.activity,
    effectiveActivity: slot.activity,
    date: slot.date,
    status: 'skipped',
    isRemote: false,
    location: slot.activity.locations[0] ?? '',
    boundResources: [],
    reason: `skipped: primary blocked (${pf.reason}) and no feasible backup`,
  });
}

/**
 * PSEUDO-ALGORITHM (buildOccurrence)
 * Denormalize the chosen activity's fields (name, category, etc.) onto a
 * ScheduledOccurrence. Set:
 *   - id = `occ-<sourceActivityId>-<YYYY-MM-DD>`
 *   - sourceActivityId (the originally-scheduled activity)
 *   - effectiveActivityId (primary id, backup id, or null when skipped)
 *   - date, status, isRemote, location, boundResources
 *   - skipAdjustment / reason when status === 'skipped'
 * Pure: no ledger access, no I/O.
 */
export function buildOccurrence(args: {
  sourceActivity: Activity;
  effectiveActivity: Activity | null;
  date: string;
  status: ScheduledOccurrence['status'];
  isRemote: boolean;
  location: string;
  boundResources: BoundResource[];
  reason?: string;
}): ScheduledOccurrence {
  const eff = args.effectiveActivity ?? args.sourceActivity;
  const occ: ScheduledOccurrence = {
    id: `occ-${args.sourceActivity.id}-${args.date}`,
    date: args.date,
    status: args.status,
    sourceActivityId: args.sourceActivity.id,
    title: eff.title,
    type: eff.type,
    details: eff.details,
    facilitatorLabel: eff.facilitatorLabel,
    location: args.location,
    isRemote: args.isRemote,
    prep: eff.prep,
    metrics: eff.metrics,
    durationMinutes: eff.durationMinutes,
    boundResources: args.boundResources,
    reason: args.reason ?? '',
  };
  if (args.status === 'substituted') {
    occ.effectiveActivityId = eff.id;
  }
  if (args.status === 'skipped') {
    occ.skipAdjustment = args.sourceActivity.skipAdjustment;
  }
  return occ;
}

/**
 * PSEUDO-ALGORITHM (compareSlots)
 * Total order used to sort the slot queue before allocation:
 *   1. priority ascending (lower number = higher priority).
 *   2. activityId ascending (lexicographic).
 *   3. date ascending (YYYY-MM-DD lexicographic == chronological).
 * Returns negative / 0 / positive per Array.prototype.sort contract.
 */
export function compareSlots(
  a: { activity: Activity; date: string },
  b: { activity: Activity; date: string },
): number {
  if (a.activity.priority !== b.activity.priority) {
    return a.activity.priority - b.activity.priority;
  }
  if (a.activity.id !== b.activity.id) {
    return a.activity.id < b.activity.id ? -1 : 1;
  }
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  return 0;
}

/**
 * PSEUDO-ALGORITHM (scheduleWithDiagnostics)
 * 1. Build activitiesById from the input list.
 * 2. EXPAND every non-isBackupOnly activity into { activity, date } slots via
 *    expandFrequency.
 * 3. ORDER slots via compareSlots (priority asc, activityId asc, date asc).
 * 4. For each slot, perform allocation AND record an AllocationTrace:
 *      - Build one AllocationAttempt for the primary (isPrimary=true).
 *      - Build one AllocationAttempt for each backupActivityIds entry, in order
 *        (isPrimary=false), regardless of whether the primary already succeeded.
 *      - Each attempt carries feasibility, boundResources (when feasible) or
 *        failedConstraints (when blocked), plus isRemote/location when feasible.
 * 5. chosenIndex = index of the first feasible attempt; null when all attempts
 *    failed (slot becomes 'skipped'). Mirror ScheduledOccurrence.status onto the
 *    trace for convenience.
 * 6. Return { result, diagnostics } where diagnostics.traces is sorted in lockstep
 *    with result.occurrences (same (date asc, priority asc) order) so consumers
 *    can index-align without a Map lookup.
 *
 * NOTE: in the 012 scaffolding pass, this function delegates to schedule(...) and
 * returns an empty traces[]; the real per-attempt accumulation lands in the 012
 * implementation pass (Tasks 2-4 in docs/backlog/012-scheduler-diagnostics.md).
 */
export function scheduleWithDiagnostics(
  activities: Activity[],
  availability: AvailabilityBundle,
): ScheduleDebugResult {
  // 012: Same EXPAND -> ORDER -> ALLOCATE -> COMMIT -> SORT pipeline as the
  // pre-012 schedule(), but threads an AllocationAttempt[] accumulator through
  // allocate() to capture every candidate's feasibility verdict.
  const activitiesById = new Map<string, Activity>();
  for (const a of activities) activitiesById.set(a.id, a);

  const slots: { activity: Activity; date: string }[] = [];
  for (const activity of activities) {
    if (activity.isBackupOnly) continue;
    const dates = expandFrequency(activity, availability.windowStart, availability.windowEnd);
    for (const date of dates) slots.push({ activity, date });
  }

  slots.sort(compareSlots);

  const ledger: PerDayLedger = new Map();
  const occurrences: ScheduledOccurrence[] = [];
  const traces: AllocationTrace[] = [];
  for (const slot of slots) {
    // 012: per-slot trace — collect attempts in primary -> backup order, then
    // derive chosenIndex from `feasible` and status from the occurrence.
    const attempts: AllocationAttempt[] = [];
    const occurrence = allocate(slot, activitiesById, ledger, availability, attempts);
    occurrences.push(occurrence);
    traces.push({
      occurrenceId: occurrence.id,
      sourceActivityId: slot.activity.id,
      targetDate: slot.date,
      attempts,
      chosenIndex: occurrence.status === 'skipped' ? null : attempts.findIndex((a) => a.feasible),
      status: occurrence.status,
    });
  }

  // 012: Sort occurrences + traces in lockstep so traces[i].occurrenceId ===
  // occurrences[i].id post-sort. Pair-sort + split keeps the lockstep invariant
  // without a Map lookup.
  const pairs = occurrences.map((occ, i) => ({ occ, trace: traces[i]! }));
  pairs.sort((a, b) => {
    if (a.occ.date !== b.occ.date) return a.occ.date < b.occ.date ? -1 : 1;
    const pa = activitiesById.get(a.occ.sourceActivityId)?.priority ?? 0;
    const pb = activitiesById.get(b.occ.sourceActivityId)?.priority ?? 0;
    return pa - pb;
  });
  const sortedOccurrences = pairs.map((p) => p.occ);
  const sortedTraces = pairs.map((p) => p.trace);

  return {
    result: {
      windowStart: availability.windowStart,
      windowEnd: availability.windowEnd,
      occurrences: sortedOccurrences,
    },
    diagnostics: {
      windowStart: availability.windowStart,
      windowEnd: availability.windowEnd,
      traces: sortedTraces,
    },
  };
}
