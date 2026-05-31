/**
 * DECISION RECAP — 015 Temporal Scheduler Core
 * - Pure, deterministic. No Date.now / Math.random / I/O. Identical input -> identical output.
 * - Adds a TIME dimension on top of 005's date-only model:
 *     EXPAND (with movement windows) -> CANDIDATE SLOTS (30-min) -> HARD FEASIBILITY ->
 *     SCORE -> pick-min -> COMMIT (action + resource ledgers) -> backups -> ASSEMBLE -> SORT.
 * - Resource feasibility/capacity is REUSED verbatim from 005 `isFeasible` (date-granular,
 *   exclusive-per-day). This preserves the engineered travel / equipment / clinician demo.
 * - The time dimension governs: member-busy overlap, member action overlap, waking horizon,
 *   and bidirectional temporal rules (avoidAfter / avoidBefore).
 * - Policy merge per activity: explicit activity.temporalPolicy > validated LLM hint >
 *   getDefaultTemporalPolicy(). Provenance recorded for diagnostics.
 * - Queue: TIER (rigidity class) first, then activity.priority asc, then date/id. Tier
 *   membership is NOT the priority field — a high-priority fitness never pre-empts the
 *   medication pass.
 * - endTime = startTime + durationMinutes, snapped UP to the next 30-min boundary for occupancy.
 */

/**
 * PSEUDO-ALGORITHM (scheduleTemporal)
 * 1. Build activitiesById + resolve each activity's policy (explicit > hint > default).
 * 2. EXPAND non-backup-only activities into { activity, genDate } slots (005 expandFrequency).
 * 3. ORDER slots by (tier, priority, genDate, activityId).
 * 4. For each slot: allocateTemporal() tries the primary across its movement window + 30-min
 *    candidate times; if none feasible, walks backupActivityIds. Commit the lowest-score
 *    feasible candidate to the action + resource ledgers; else emit a skipped occurrence.
 * 5. SORT occurrences + traces in lockstep by (date, startTime, priority).
 */

import type {
  Activity,
  ActivityTemporalPolicy,
  ActivityType,
  AllocationAttempt,
  AllocationTrace,
  AvailabilityBundle,
  BoundResource,
  FailedConstraint,
  LocalTime,
  MemberBusyBlock,
  PolicySource,
  ScheduleDebugResult,
  ScheduledOccurrence,
  SchedulingSemanticHints,
  TimeBlockPreference,
} from './types';
import { getDefaultTemporalPolicy } from './temporal-policy';
import { bundleAssignment } from './bundle';
import {
  addDaysYMD,
  buildOccurrence,
  daysBetweenYMD,
  expandFrequency,
  isDateInRange,
  isFeasible,
  type PerDayLedger,
} from './scheduler';

// ---------- Time helpers (local wall-clock minutes; 30-min granularity) ----------

const SLOT = 30;
const WAKE_START = 6 * 60; // 06:00 — candidate horizon start
const WAKE_END = 22 * 60 + 30; // 22:30 — candidate horizon end (sleep blocks enforce the rest)

function timeToMin(t: LocalTime): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

function minToTime(m: number): LocalTime {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(hh)}:${p(mm)}` as LocalTime;
}

function snapUp30(m: number): number {
  return Math.ceil(m / SLOT) * SLOT;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------- Score weights (named per 015; lower total is better) ----------

export const TEMPORAL_SCORE_WEIGHTS = {
  movedPerDay: 6, // each day away from the generated date
  outsidePreferredWindow: 18, // candidate not inside any preferred/anchor window
  sameDayOverloadPer: 3, // per health action already committed that day
  nearMealSoft: 10, // within 60 min of a meal but not hard-blocked
  lateEveningStimulating: 15, // high-intensity start after 19:00
  usesBackup: 12, // chosen candidate is a backup, not the primary
} as const;

const LATE_EVENING_MIN = 19 * 60;

// ---------- Resolved policy with provenance ----------

interface ResolvedPolicy {
  policy: ActivityTemporalPolicy;
  source: PolicySource;
}

function buildPolicyResolver(
  activities: Activity[],
  hints: SchedulingSemanticHints | undefined,
): (activity: Activity) => ResolvedPolicy {
  // Validated, above-threshold hint policies keyed by activityId.
  const hintById = new Map<string, ActivityTemporalPolicy>();
  if (hints) {
    for (const h of hints.activityPolicies) {
      if (h.confidence >= 0.7) hintById.set(h.activityId, h.temporalPolicy);
    }
  }
  return (activity: Activity): ResolvedPolicy => {
    if (activity.temporalPolicy) return { policy: activity.temporalPolicy, source: 'explicit' };
    const hint = hintById.get(activity.id);
    if (hint) return { policy: hint, source: 'llm-hint' };
    return { policy: getDefaultTemporalPolicy(activity), source: 'default' };
  };
}

// ---------- Member busy blocks (resolved per day) ----------

interface DayBusy {
  category: MemberBusyBlock['category'];
  blocksScheduling: boolean;
  startMin: number;
  endMin: number;
  title: string;
}

function busyOnDay(availability: AvailabilityBundle, day: string): DayBusy[] {
  const out: DayBusy[] = [];
  for (const mb of availability.memberBusy) {
    for (const tb of mb.blocks) {
      if (tb.date !== day) continue;
      out.push({
        category: mb.category,
        blocksScheduling: mb.blocksScheduling,
        startMin: timeToMin(tb.startTime),
        endMin: timeToMin(tb.endTime),
        title: mb.title,
      });
    }
  }
  return out;
}

// ---------- Committed member actions (action ledger entries) ----------

interface CommittedAction {
  startMin: number;
  endMin: number;
  type: ActivityType;
  intensity: ActivityTemporalPolicy['intensity'];
  policy: ActivityTemporalPolicy;
  activityId: string;
  blocking: boolean;
}

type ActionLedger = Map<string /* date */, CommittedAction[]>;

/**
 * "Blocking" actions occupy exclusive focused member time (strength/VO2 workouts, therapy
 * sessions, consultations, meal prep) — no two may overlap and they cannot overlap blocking
 * busy blocks. "Quick" actions are point-in-time: they get a placed time and still obey waking
 * hours + their own temporal rules, but may coincide with each other and with blocking actions.
 * Quick = (<20 min: pills, BP/CGM logs, hydration, short food habits) OR low-intensity fitness
 * (brisk walks, mobility, balance, step-count) which weave into the day rather than demanding a
 * focused booking. This realizes 015's "daily overload is a soft score, not a dropped action".
 */
function isBlocking(activity: Activity, policy: ActivityTemporalPolicy): boolean {
  if (activity.type === 'fitness' && policy.intensity === 'low') return false;
  return activity.durationMinutes >= 20;
}

// ---------- Preferred-window + anchor resolution ----------

const ANCHOR_FALLBACK: Record<string, [number, number]> = {
  wake: [6 * 60, 7 * 60],
  breakfast: [7 * 60 + 30, 8 * 60],
  lunch: [12 * 60 + 15, 13 * 60],
  dinner: [19 * 60, 19 * 60 + 45],
  bedtime: [20 * 60 + 30, 22 * 60],
};

const ANCHOR_MEAL_KEYWORD: Record<string, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
};

/** Resolve the anchor to a [startMin,endMin] window (real meal block if present, else fallback). */
function anchorWindow(
  policy: ActivityTemporalPolicy,
  busy: DayBusy[],
): [number, number] | null {
  const a = policy.anchor;
  if (!a || a === 'any') return null;
  const kw = ANCHOR_MEAL_KEYWORD[a];
  if (kw) {
    const meal = busy.find(
      (b) => b.category === 'meal' && b.title.toLowerCase().includes(kw) && b.startMin < 11 * 60,
    );
    if (meal) return [meal.startMin, meal.endMin];
  }
  return ANCHOR_FALLBACK[a] ?? null;
}

function inAnyWindow(startMin: number, endMin: number, windows: TimeBlockPreference[]): boolean {
  return windows.some((w) => startMin >= timeToMin(w.startTime) && endMin <= timeToMin(w.endTime));
}

function inPreferred(
  startMin: number,
  endMin: number,
  policy: ActivityTemporalPolicy,
  anchor: [number, number] | null,
): boolean {
  if (inAnyWindow(startMin, endMin, policy.preferredWindows)) return true;
  if (anchor && startMin >= anchor[0] && endMin <= anchor[1] + SLOT) return true;
  return false;
}

// ---------- Bidirectional temporal-rule check ----------

interface ProtoEvent {
  startMin: number;
  endMin: number;
  type?: ActivityType;
  intensity?: ActivityTemporalPolicy['intensity'];
  category?: MemberBusyBlock['category'];
  policy?: ActivityTemporalPolicy;
}

function ruleMatches(
  rule: { activityType?: ActivityType; intensity?: 'moderate' | 'high'; category?: MemberBusyBlock['category'] },
  ev: ProtoEvent,
): boolean {
  if (rule.activityType !== undefined && rule.activityType !== ev.type) return false;
  if (rule.category !== undefined && rule.category !== ev.category) return false;
  if (rule.intensity !== undefined) {
    // 'high' matches high; 'moderate' matches moderate or high.
    if (rule.intensity === 'high' && ev.intensity !== 'high') return false;
    if (rule.intensity === 'moderate' && !(ev.intensity === 'moderate' || ev.intensity === 'high')) return false;
  }
  return true;
}

/**
 * Returns a violated temporal rule between two non-overlapping events, or null.
 * 015 treats avoidAfter / avoidBefore as SYMMETRIC proximity bans ("these two should not be
 * near each other") per the plan: a rule on EITHER event fires when the other event is within
 * `withinMinutes`, in either order. This is the normalized-pairwise-predicate behavior — e.g.
 * "BP avoids high-intensity fitness within 120m" rejects fitness whether it lands before or
 * after the BP reading.
 */
function temporalRuleViolation(a: ProtoEvent, b: ProtoEvent): FailedConstraint | null {
  const [x, y] = a.startMin <= b.startMin ? [a, b] : [b, a];
  const gap = y.startMin - x.endMin; // >= 0 when non-overlapping
  if (gap < 0) return null; // overlaps are handled by the hard overlap checks
  const xRules = [...(x.policy?.avoidAfter ?? []), ...(x.policy?.avoidBefore ?? [])];
  const yRules = [...(y.policy?.avoidAfter ?? []), ...(y.policy?.avoidBefore ?? [])];
  for (const rule of xRules) {
    if (gap < rule.withinMinutes && ruleMatches(rule, y)) return { kind: 'temporalRule', detail: rule.reason };
  }
  for (const rule of yRules) {
    if (gap < rule.withinMinutes && ruleMatches(rule, x)) return { kind: 'temporalRule', detail: rule.reason };
  }
  return null;
}

// ---------- Candidate day movement windows ----------

const MOVE_RADIUS: Record<Activity['frequency']['period'], number> = {
  day: 0,
  week: 3, // ±3 days from the generated Monday spans the whole week, spreading the pile-up
  month: 6,
  year: 30,
};

/**
 * 016 §3 — deterministic per-activity weekday stagger (0-6 days). expandFrequency pins every
 * weekly activity's base day to Monday, so ~30 weekly actions pile on Mondays and the tier-5
 * ones (breathwork/recovery) never win the scarce evening slot. Shifting each weekly activity's
 * generated dates by a stable hash spreads them across the week before scoring/movement.
 */
function staggerOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 7;
  return h;
}

function candidateDays(activity: Activity, genDate: string, windowStart: string, windowEnd: string): string[] {
  const radius = MOVE_RADIUS[activity.frequency.period];
  const out: string[] = [];
  for (let off = -radius; off <= radius; off++) {
    const d = addDaysYMD(genDate, off);
    if (d >= windowStart && d <= windowEnd) out.push(d);
  }
  return out;
}

// ---------- One feasible/representative candidate evaluation ----------

interface FeasibleCandidate {
  day: string;
  startMin: number;
  endMin: number;
  score: number;
  bound: BoundResource[];
  isRemote: boolean;
  location: string;
  inPreferred: boolean;
}

const MAX_FAIL_DETAIL = 8;

/**
 * Evaluate every candidate slot for one activity across its movement window.
 * Returns the feasible candidates (for scoring) plus a capped list of representative
 * failed constraints (for diagnostics) and any day-level resource/travel failure.
 */
function evaluateCandidates(
  activity: Activity,
  resolved: ResolvedPolicy,
  genDate: string,
  resourceLedger: PerDayLedger,
  actionLedger: ActionLedger,
  availability: AvailabilityBundle,
  excludeDays: Set<string>,
): { feasible: FeasibleCandidate[]; fails: FailedConstraint[] } {
  const policy = resolved.policy;
  const duration = Math.max(activity.durationMinutes, 1);
  const candBlocking = isBlocking(activity, policy);
  const feasible: FeasibleCandidate[] = [];
  // 016 §C: dedupe identical failed constraints (e.g. the same "no cardiologist" reason emitted
  // once per rejected candidate day) and carry a count, so the Trace shows one line, not seven.
  const failMap = new Map<string, { fc: FailedConstraint; count: number }>();
  const pushFail = (fc: FailedConstraint) => {
    const sig = `${fc.kind}|${fc.role ?? ''}|${fc.resourceId ?? ''}|${fc.detail}`;
    const ex = failMap.get(sig);
    if (ex) ex.count += 1;
    else if (failMap.size < MAX_FAIL_DETAIL) failMap.set(sig, { fc, count: 1 });
  };

  for (const day of candidateDays(activity, genDate, availability.windowStart, availability.windowEnd)) {
    // Don't place a second occurrence of the same source activity on a day it already occupies
    // (movement windows could otherwise collide two due-dates onto one day).
    if (excludeDays.has(day)) continue;
    // Resource + travel feasibility is date-granular (005 model), evaluated once per day.
    const rf = isFeasible(activity, day, resourceLedger, availability);
    if (!rf.feasible) {
      for (const fc of rf.failedConstraints) pushFail(fc);
      continue;
    }

    const busy = busyOnDay(availability, day);
    const anchor = anchorWindow(policy, busy);
    const committed = actionLedger.get(day) ?? [];
    const movedDays = Math.abs(daysBetweenYMD(genDate, day));

    for (let startMin = WAKE_START; startMin + SLOT <= WAKE_END + SLOT; startMin += SLOT) {
      const endMin = snapUp30(startMin + duration);
      if (endMin > WAKE_END) break;

      const cand: ProtoEvent = {
        startMin,
        endMin,
        type: activity.type,
        intensity: policy.intensity,
        policy,
      };

      // HARD: member busy overlap. Blocking actions avoid all blocksScheduling blocks;
      // quick actions only avoid sleep (so they stay in waking hours but may coincide with
      // work/commute/meal/travel — taking a pill during your commute is fine).
      // 016 §3: consultations are appointments the member steps OUT of work for, so they may
      // overlap a 'work' block (otherwise business hours == work hours and consults never fit).
      let blocked = false;
      for (const b of busy) {
        if (!overlaps(startMin, endMin, b.startMin, b.endMin)) continue;
        let hard: boolean;
        if (!candBlocking) hard = b.category === 'sleep';
        else if (activity.type === 'consultation' && b.category === 'work') hard = false;
        else hard = b.blocksScheduling;
        if (hard) {
          pushFail({ kind: 'memberBusy', detail: `${minToTime(startMin)} overlaps ${b.title} (${b.category})` });
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // HARD: member action overlap — only blocking-vs-blocking (focused time is exclusive).
      if (candBlocking) {
        for (const c of committed) {
          if (c.blocking && overlaps(startMin, endMin, c.startMin, c.endMin)) {
            pushFail({ kind: 'actionOverlap', detail: `${minToTime(startMin)} overlaps a scheduled action` });
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
      }

      // HARD: bidirectional temporal rules vs committed actions + busy blocks.
      let ruleFail: FailedConstraint | null = null;
      for (const c of committed) {
        const v = temporalRuleViolation(cand, {
          startMin: c.startMin,
          endMin: c.endMin,
          type: c.type,
          intensity: c.intensity,
          policy: c.policy,
        });
        if (v) {
          ruleFail = { ...v, detail: `${minToTime(startMin)} — ${v.detail}` };
          break;
        }
      }
      if (!ruleFail) {
        for (const b of busy) {
          const v = temporalRuleViolation(cand, { startMin: b.startMin, endMin: b.endMin, category: b.category });
          if (v) {
            ruleFail = { ...v, detail: `${minToTime(startMin)} — ${v.detail}` };
            break;
          }
        }
      }
      if (ruleFail) {
        pushFail(ruleFail);
        continue;
      }

      // FEASIBLE — score it.
      const within = inPreferred(startMin, endMin, policy, anchor);
      let score = movedDays * TEMPORAL_SCORE_WEIGHTS.movedPerDay;
      if (!within) {
        score += TEMPORAL_SCORE_WEIGHTS.outsidePreferredWindow;
        pushFail({ kind: 'outsidePreferredWindow', detail: `${minToTime(startMin)} is outside the preferred window` });
      }
      score += committed.length * TEMPORAL_SCORE_WEIGHTS.sameDayOverloadPer;
      for (const b of busy) {
        if (b.category === 'meal' && !overlaps(startMin, endMin, b.startMin, b.endMin)) {
          const gap = Math.min(Math.abs(startMin - b.endMin), Math.abs(b.startMin - endMin));
          if (gap < 60) score += TEMPORAL_SCORE_WEIGHTS.nearMealSoft;
        }
      }
      if (policy.intensity === 'high' && startMin >= LATE_EVENING_MIN) {
        score += TEMPORAL_SCORE_WEIGHTS.lateEveningStimulating;
      }

      feasible.push({
        day,
        startMin,
        endMin,
        score,
        bound: rf.boundResources,
        isRemote: rf.isRemote,
        location: rf.location,
        inPreferred: within,
      });
    }
  }

  const fails: FailedConstraint[] = [...failMap.values()].map(({ fc, count }) =>
    count > 1 ? { ...fc, detail: `${fc.detail} (×${count})` } : fc,
  );
  return { feasible, fails };
}

function pickBest(cands: FeasibleCandidate[]): FeasibleCandidate | null {
  let best: FeasibleCandidate | null = null;
  for (const c of cands) {
    if (
      best === null ||
      c.score < best.score ||
      (c.score === best.score && c.day < best.day) ||
      (c.score === best.score && c.day === best.day && c.startMin < best.startMin)
    ) {
      best = c;
    }
  }
  return best;
}

// ---------- Tiered queue order ----------

function queueTier(activity: Activity, policy: ActivityTemporalPolicy): number {
  switch (activity.type) {
    case 'medication':
      return 1;
    case 'consultation':
      return 2;
    case 'therapy':
      // Downshift / low-intensity recovery sequences last; clinician-bound therapy is tier 2.
      if (policy.anchor === 'bedtime' || policy.intensity === 'low') return 5;
      return activity.resources.length > 0 ? 2 : 4;
    case 'fitness':
      if (policy.intensity === 'high') return 3;
      if (policy.intensity === 'low') return 5;
      return 4;
    case 'food':
      return 4;
  }
  return 4;
}

// ---------- Allocation ----------

interface TempSlot {
  activity: Activity;
  genDate: string;
  tier: number;
}

function allocateTemporal(
  slot: TempSlot,
  activitiesById: Map<string, Activity>,
  resolve: (a: Activity) => ResolvedPolicy,
  resourceLedger: PerDayLedger,
  actionLedger: ActionLedger,
  availability: AvailabilityBundle,
  excludeDays: Set<string>,
): { occurrence: ScheduledOccurrence; trace: AllocationTrace } {
  const attempts: AllocationAttempt[] = [];

  const commit = (
    day: string,
    cand: FeasibleCandidate,
    chosen: Activity,
    resolved: ResolvedPolicy,
  ) => {
    let dayBookings = resourceLedger.get(day);
    if (!dayBookings) {
      dayBookings = new Set();
      resourceLedger.set(day, dayBookings);
    }
    for (const b of cand.bound) dayBookings.add(b.id);
    let acts = actionLedger.get(day);
    if (!acts) {
      acts = [];
      actionLedger.set(day, acts);
    }
    acts.push({
      startMin: cand.startMin,
      endMin: cand.endMin,
      type: chosen.type,
      intensity: resolved.policy.intensity,
      policy: resolved.policy,
      activityId: chosen.id,
      blocking: isBlocking(chosen, resolved.policy),
    });
  };

  const tryCandidate = (
    candidateActivity: Activity,
    isPrimary: boolean,
  ): { occ: ScheduledOccurrence; chosen: FeasibleCandidate } | null => {
    const resolved = resolve(candidateActivity);
    const { feasible, fails } = evaluateCandidates(
      candidateActivity,
      resolved,
      slot.genDate,
      resourceLedger,
      actionLedger,
      availability,
      excludeDays,
    );
    const best = pickBest(feasible);
    if (best) {
      const score = best.score + (isPrimary ? 0 : TEMPORAL_SCORE_WEIGHTS.usesBackup);
      attempts.push({
        candidateActivityId: candidateActivity.id,
        isPrimary,
        feasible: true,
        boundResources: best.bound,
        failedConstraints: [],
        isRemote: best.isRemote,
        location: best.location,
        candidateDate: best.day,
        candidateStartTime: minToTime(best.startMin),
        candidateEndTime: minToTime(best.endMin),
        score,
        policySource: resolved.source,
      });
      commit(best.day, best, candidateActivity, resolved);
      const occ = buildOccurrence({
        sourceActivity: slot.activity,
        effectiveActivity: candidateActivity,
        date: best.day,
        status: isPrimary ? 'scheduled' : 'substituted',
        isRemote: best.isRemote,
        location: best.location,
        boundResources: best.bound,
        reason: isPrimary
          ? `scheduled ${minToTime(best.startMin)}-${minToTime(best.endMin)} (score ${score})`
          : `substituted: ${candidateActivity.id} at ${minToTime(best.startMin)}-${minToTime(best.endMin)} (score ${score})`,
      });
      occ.startTime = minToTime(best.startMin);
      occ.endTime = minToTime(best.endMin);
      occ.timeZone = availability.timeZone;
      occ.outsidePreferredWindow = !best.inPreferred;
      // 016 §11 — tag SCHEDULED low-risk daily food/med for customer-facing bundling.
      // Substituted (isPrimary=false) is never bundled — it stays individual (adaptation story).
      if (isPrimary) {
        const ba = bundleAssignment(candidateActivity, resolved.policy);
        if (ba) {
          occ.displayBundleId = ba.bundleId;
          occ.displayBundleLabel = ba.label;
        }
      }
      // ID derives from the stable due-date (genDate), NOT the placed day: with movement
      // windows two occurrences of the same activity can land on the same day, which would
      // collide if keyed by placed day (duplicate React keys + broken trace lockstep).
      occ.id = `occ-${slot.activity.id}-${slot.genDate}`;
      return { occ, chosen: best };
    }
    attempts.push({
      candidateActivityId: candidateActivity.id,
      isPrimary,
      feasible: false,
      boundResources: [],
      failedConstraints: fails.length > 0 ? fails : [{ kind: 'temporalRule', detail: 'no feasible slot in the movement window' }],
      candidateDate: slot.genDate,
      policySource: resolved.source,
    });
    return null;
  };

  // Primary, then backups in order.
  let result = tryCandidate(slot.activity, true);
  if (!result) {
    for (const backupId of slot.activity.backupActivityIds) {
      const backup = activitiesById.get(backupId);
      if (!backup) continue;
      result = tryCandidate(backup, false);
      if (result) break;
    }
  }

  if (result) {
    return {
      occurrence: result.occ,
      trace: {
        occurrenceId: result.occ.id,
        sourceActivityId: slot.activity.id,
        targetDate: result.occ.date,
        attempts,
        chosenIndex: attempts.findIndex((a) => a.feasible),
        status: result.occ.status,
      },
    };
  }

  // Skipped — aggregate the primary's failure reasons.
  const skipReason = attempts[0]?.failedConstraints.map((f) => f.detail).join('; ') ?? 'no feasible slot';
  const occ = buildOccurrence({
    sourceActivity: slot.activity,
    effectiveActivity: slot.activity,
    date: slot.genDate,
    status: 'skipped',
    isRemote: false,
    location: slot.activity.locations[0] ?? '',
    boundResources: [],
    reason: `skipped: ${skipReason}`,
  });
  return {
    occurrence: occ,
    trace: {
      occurrenceId: occ.id,
      sourceActivityId: slot.activity.id,
      targetDate: slot.genDate,
      attempts,
      chosenIndex: null,
      status: 'skipped',
    },
  };
}

// ---------- Public entry ----------

export function scheduleTemporal(
  activities: Activity[],
  availability: AvailabilityBundle,
  hints?: SchedulingSemanticHints,
): ScheduleDebugResult {
  const activitiesById = new Map<string, Activity>();
  for (const a of activities) activitiesById.set(a.id, a);
  const resolve = buildPolicyResolver(activities, hints);

  // EXPAND + tag tier.
  const slots: TempSlot[] = [];
  for (const activity of activities) {
    if (activity.isBackupOnly) continue;
    const tier = queueTier(activity, resolve(activity).policy);
    // 016 §3: spread weekly activities across the week so they don't all pile on Monday.
    const offset = activity.frequency.period === 'week' ? staggerOffset(activity.id) : 0;
    for (const baseDate of expandFrequency(activity, availability.windowStart, availability.windowEnd)) {
      const genDate = offset ? addDaysYMD(baseDate, offset) : baseDate;
      if (genDate < availability.windowStart || genDate > availability.windowEnd) continue;
      slots.push({ activity, genDate, tier });
    }
  }

  // ORDER: tier, then priority, then genDate, then activityId (deterministic).
  slots.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.activity.priority !== b.activity.priority) return a.activity.priority - b.activity.priority;
    if (a.genDate !== b.genDate) return a.genDate < b.genDate ? -1 : 1;
    return a.activity.id < b.activity.id ? -1 : a.activity.id > b.activity.id ? 1 : 0;
  });

  const resourceLedger: PerDayLedger = new Map();
  const actionLedger: ActionLedger = new Map();
  const placedDays = new Map<string /* sourceActivityId */, Set<string /* day */>>();
  const occurrences: ScheduledOccurrence[] = [];
  const traces: AllocationTrace[] = [];

  for (const slot of slots) {
    let excl = placedDays.get(slot.activity.id);
    if (!excl) {
      excl = new Set();
      placedDays.set(slot.activity.id, excl);
    }
    const { occurrence, trace } = allocateTemporal(
      slot,
      activitiesById,
      resolve,
      resourceLedger,
      actionLedger,
      availability,
      excl,
    );
    if (occurrence.status !== 'skipped') excl.add(occurrence.date);
    occurrences.push(occurrence);
    traces.push(trace);
  }

  // SORT occurrences + traces in lockstep by (date, startTime, priority, id).
  const pairs = occurrences.map((occ, i) => ({ occ, trace: traces[i]! }));
  pairs.sort((a, b) => {
    if (a.occ.date !== b.occ.date) return a.occ.date < b.occ.date ? -1 : 1;
    const sa = a.occ.startTime ?? '99:99';
    const sb = b.occ.startTime ?? '99:99';
    if (sa !== sb) return sa < sb ? -1 : 1;
    const pa = activitiesById.get(a.occ.sourceActivityId)?.priority ?? 0;
    const pb = activitiesById.get(b.occ.sourceActivityId)?.priority ?? 0;
    if (pa !== pb) return pa - pb;
    return a.occ.id < b.occ.id ? -1 : a.occ.id > b.occ.id ? 1 : 0;
  });

  return {
    result: {
      windowStart: availability.windowStart,
      windowEnd: availability.windowEnd,
      occurrences: pairs.map((p) => p.occ),
    },
    diagnostics: {
      windowStart: availability.windowStart,
      windowEnd: availability.windowEnd,
      traces: pairs.map((p) => p.trace),
    },
  };
}
