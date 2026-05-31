/**
 * DECISION RECAP — 002 Define JSON Data Model
 * - Validation is hand-rolled (no zod) and runs only at system boundaries:
 *     JSON import (003 fixtures) and the 009 stretch-goal import path.
 * - Internal code trusts the type system; predicates here narrow `unknown` to canonical types.
 * - ResourceRequirement.role and availability `role` fields must match the role unions in `./roles`.
 */

/**
 * PSEUDO-ALGORITHM — shared validation strategy
 *   1. Reject non-objects (null, arrays where an object is expected, primitives).
 *   2. Assert presence of each required field and check its primitive type
 *      (string / number / boolean) or its sub-shape via the matching predicate.
 *   3. For array fields, verify Array.isArray, then recurse with the element predicate.
 *   4. For closed unions (ActivityType, ResourceKind, Frequency.period, status), check
 *      enum-membership against a literal set.
 *   5. For YYYY-MM-DD strings, apply a strict /^\d{4}-\d{2}-\d{2}$/ regex.
 *   6. For role strings on ResourceRequirement and the four availability shapes, require
 *      membership in the appropriate role union from `./roles` keyed off `kind` / shape.
 *   7. Optional fields are validated only when present (typeof !== 'undefined').
 */

import { ALLIED_HEALTH_ROLES, EQUIPMENT_ROLES, SPECIALIST_ROLES } from './roles';
import type {
  Activity,
  ActivityTemporalPolicy,
  ActivityTemporalPolicyHint,
  AllocationAttempt,
  AllocationTrace,
  AlliedHealthAvailability,
  AvailabilityBundle,
  BoundResource,
  BusyBlockClassification,
  DateRange,
  EquipmentAvailability,
  FailedConstraint,
  Frequency,
  LocalTime,
  MemberBusyBlock,
  ResourceRequirement,
  ScheduleDebugResult,
  ScheduleDiagnostics,
  ScheduleResult,
  ScheduledOccurrence,
  SchedulingSemanticHints,
  SemanticWarning,
  SpecialistAvailability,
  TemporalAvoidRule,
  TemporalRuleHint,
  TimeBlock,
  TimeBlockPreference,
  TravelPlan,
} from './types';

const EQUIPMENT_ROLE_SET = new Set<string>(EQUIPMENT_ROLES);
const SPECIALIST_ROLE_SET = new Set<string>(SPECIALIST_ROLES);
const ALLIED_HEALTH_ROLE_SET = new Set<string>(ALLIED_HEALTH_ROLES);

const ACTIVITY_TYPES = new Set<string>(['fitness', 'food', 'medication', 'therapy', 'consultation'] as const);
const RESOURCE_KINDS = new Set<string>(['equipment', 'specialist', 'alliedHealth'] as const);
const PERIODS = new Set<string>(['day', 'week', 'month', 'year'] as const);
const STATUSES = new Set<string>(['scheduled', 'substituted', 'skipped'] as const);

// 015 — temporal enum sets.
const MEMBER_BUSY_CATEGORIES = new Set<string>([
  'sleep',
  'work',
  'commute',
  'meal',
  'family',
  'travel',
  'personal',
  'clinical',
  'buffer',
] as const);
const TIME_PREF_LABELS = new Set<string>(['morning', 'midday', 'afternoon', 'evening'] as const);
const ANCHORS = new Set<string>(['wake', 'breakfast', 'lunch', 'dinner', 'bedtime', 'any'] as const);
const INTENSITIES = new Set<string>(['none', 'low', 'moderate', 'high'] as const);
const AVOID_INTENSITIES = new Set<string>(['moderate', 'high'] as const);
const POLICY_SOURCES = new Set<string>(['explicit', 'default', 'llm-hint'] as const);
// HH:MM with hh in 00-23 and mm in 00-59 — rejects 24:00 and any hh>23 / mm>59.
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isStr(x: unknown): x is string {
  return typeof x === 'string';
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isBool(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

function isArr(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function isDateStr(x: unknown): x is string {
  return isStr(x) && /^\d{4}-\d{2}-\d{2}$/.test(x);
}

export function isDateRange(x: unknown): x is DateRange {
  return isObj(x) && isDateStr(x.start) && isDateStr(x.end);
}

export function isFrequency(x: unknown): x is Frequency {
  return isObj(x) && isNum(x.count) && x.count > 0 && isStr(x.period) && PERIODS.has(x.period);
}

export function isResourceRequirement(x: unknown): x is ResourceRequirement {
  if (!isObj(x)) return false;
  if (!isStr(x.kind) || !RESOURCE_KINDS.has(x.kind)) return false;
  if (!isStr(x.role)) return false;
  const roleSet =
    x.kind === 'equipment'
      ? EQUIPMENT_ROLE_SET
      : x.kind === 'specialist'
      ? SPECIALIST_ROLE_SET
      : ALLIED_HEALTH_ROLE_SET;
  if (!roleSet.has(x.role)) return false;
  if (typeof x.id !== 'undefined' && !isStr(x.id)) return false;
  return true;
}

// === 015: temporal type guards ===

export function isLocalTime(x: unknown): x is LocalTime {
  return isStr(x) && LOCAL_TIME_RE.test(x);
}

export function isTimeBlock(x: unknown): x is TimeBlock {
  if (!isObj(x)) return false;
  if (!isDateStr(x.date)) return false;
  if (!isLocalTime(x.startTime) || !isLocalTime(x.endTime)) return false;
  // Zero-padded HH:MM compares lexicographically == chronologically; require start < end
  // (also enforces no midnight crossing — split overnight blocks at 23:59 / 00:00).
  if (!(x.startTime < x.endTime)) return false;
  if (typeof x.timeZone !== 'undefined' && !isStr(x.timeZone)) return false;
  return true;
}

export function isMemberBusyBlock(x: unknown): x is MemberBusyBlock {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || x.id.length === 0) return false;
  if (!isStr(x.title)) return false;
  if (!isStr(x.category) || !MEMBER_BUSY_CATEGORIES.has(x.category)) return false;
  if (!isArr(x.blocks) || !x.blocks.every(isTimeBlock)) return false;
  if (!isBool(x.blocksScheduling)) return false;
  if (!isBool(x.visibleByDefault)) return false;
  return true;
}

export function isTimeBlockPreference(x: unknown): x is TimeBlockPreference {
  if (!isObj(x)) return false;
  if (!isStr(x.label) || !TIME_PREF_LABELS.has(x.label)) return false;
  if (!isLocalTime(x.startTime) || !isLocalTime(x.endTime)) return false;
  if (!(x.startTime < x.endTime)) return false;
  return true;
}

export function isTemporalAvoidRule(x: unknown): x is TemporalAvoidRule {
  if (!isObj(x)) return false;
  if (typeof x.activityType !== 'undefined' && (!isStr(x.activityType) || !ACTIVITY_TYPES.has(x.activityType))) {
    return false;
  }
  if (typeof x.intensity !== 'undefined' && (!isStr(x.intensity) || !AVOID_INTENSITIES.has(x.intensity))) {
    return false;
  }
  if (typeof x.category !== 'undefined' && (!isStr(x.category) || !MEMBER_BUSY_CATEGORIES.has(x.category))) {
    return false;
  }
  if (!isNum(x.withinMinutes) || x.withinMinutes < 0) return false;
  if (!isStr(x.reason)) return false;
  return true;
}

export function isActivityTemporalPolicy(x: unknown): x is ActivityTemporalPolicy {
  if (!isObj(x)) return false;
  if (!isArr(x.preferredWindows) || !x.preferredWindows.every(isTimeBlockPreference)) return false;
  if (typeof x.anchor !== 'undefined' && (!isStr(x.anchor) || !ANCHORS.has(x.anchor))) return false;
  if (typeof x.intensity !== 'undefined' && (!isStr(x.intensity) || !INTENSITIES.has(x.intensity))) return false;
  if (typeof x.minGapBeforeMinutes !== 'undefined' && (!isNum(x.minGapBeforeMinutes) || x.minGapBeforeMinutes < 0)) {
    return false;
  }
  if (typeof x.minGapAfterMinutes !== 'undefined' && (!isNum(x.minGapAfterMinutes) || x.minGapAfterMinutes < 0)) {
    return false;
  }
  if (typeof x.avoidAfter !== 'undefined' && (!isArr(x.avoidAfter) || !x.avoidAfter.every(isTemporalAvoidRule))) {
    return false;
  }
  if (typeof x.avoidBefore !== 'undefined' && (!isArr(x.avoidBefore) || !x.avoidBefore.every(isTemporalAvoidRule))) {
    return false;
  }
  return true;
}

export function isActivity(x: unknown): x is Activity {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || x.id.length === 0) return false;
  if (!isStr(x.type) || !ACTIVITY_TYPES.has(x.type)) return false;
  if (!isStr(x.title)) return false;
  if (!isStr(x.details)) return false;
  if (!isStr(x.skipAdjustment)) return false;
  if (!isFrequency(x.frequency)) return false;
  if (!isNum(x.durationMinutes) || x.durationMinutes < 0) return false;
  if (!isNum(x.priority) || !Number.isInteger(x.priority) || x.priority < 1) return false;
  if (!isStr(x.facilitatorLabel)) return false;
  if (!isArr(x.locations) || !x.locations.every(isStr)) return false;
  if (!isBool(x.canBeRemote)) return false;
  if (!isArr(x.prep) || !x.prep.every(isStr)) return false;
  if (!isArr(x.resources) || !x.resources.every(isResourceRequirement)) return false;
  if (!isArr(x.backupActivityIds) || !x.backupActivityIds.every(isStr)) return false;
  if (!isArr(x.metrics) || !x.metrics.every(isStr)) return false;
  if (!isBool(x.isBackupOnly)) return false;
  if (typeof x.temporalPolicy !== 'undefined' && !isActivityTemporalPolicy(x.temporalPolicy)) return false;
  return true;
}

export function isTravelPlan(x: unknown): x is TravelPlan {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isStr(x.destination)) return false;
  if (!isArr(x.blocked) || !x.blocked.every(isDateRange)) return false;
  return true;
}

export function isEquipmentAvailability(x: unknown): x is EquipmentAvailability {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isStr(x.role) || !EQUIPMENT_ROLE_SET.has(x.role)) return false;
  if (!isStr(x.label)) return false;
  if (!isArr(x.blocked) || !x.blocked.every(isDateRange)) return false;
  return true;
}

export function isSpecialistAvailability(x: unknown): x is SpecialistAvailability {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isStr(x.role) || !SPECIALIST_ROLE_SET.has(x.role)) return false;
  if (!isStr(x.name)) return false;
  if (!isArr(x.available) || !x.available.every(isDateRange)) return false;
  return true;
}

export function isAlliedHealthAvailability(x: unknown): x is AlliedHealthAvailability {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isStr(x.role) || !ALLIED_HEALTH_ROLE_SET.has(x.role)) return false;
  if (!isStr(x.discipline)) return false;
  if (!isStr(x.name)) return false;
  if (!isArr(x.available) || !x.available.every(isDateRange)) return false;
  return true;
}

export function isAvailabilityBundle(x: unknown): x is AvailabilityBundle {
  if (!isObj(x)) return false;
  if (!isDateStr(x.windowStart) || !isDateStr(x.windowEnd)) return false;
  if (!isStr(x.timeZone) || x.timeZone.length === 0) return false;
  if (!isArr(x.memberBusy) || !x.memberBusy.every(isMemberBusyBlock)) return false;
  if (!isArr(x.travel) || !x.travel.every(isTravelPlan)) return false;
  if (!isArr(x.equipment) || !x.equipment.every(isEquipmentAvailability)) return false;
  if (!isArr(x.specialists) || !x.specialists.every(isSpecialistAvailability)) return false;
  if (!isArr(x.alliedHealth) || !x.alliedHealth.every(isAlliedHealthAvailability)) return false;
  return true;
}

export function isBoundResource(x: unknown): x is BoundResource {
  if (!isObj(x)) return false;
  if (!isStr(x.kind) || !RESOURCE_KINDS.has(x.kind)) return false;
  if (!isStr(x.role)) return false;
  if (!isStr(x.id)) return false;
  return true;
}

export function isScheduledOccurrence(x: unknown): x is ScheduledOccurrence {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (!isDateStr(x.date)) return false;
  if (typeof x.startTime !== 'undefined' && !isLocalTime(x.startTime)) return false;
  if (typeof x.endTime !== 'undefined' && !isLocalTime(x.endTime)) return false;
  if (typeof x.timeZone !== 'undefined' && !isStr(x.timeZone)) return false;
  if (typeof x.outsidePreferredWindow !== 'undefined' && !isBool(x.outsidePreferredWindow)) return false;
  if (!isStr(x.status) || !STATUSES.has(x.status)) return false;
  if (!isStr(x.sourceActivityId)) return false;
  if (typeof x.effectiveActivityId !== 'undefined' && !isStr(x.effectiveActivityId)) return false;
  if (typeof x.sourceTitle !== 'undefined' && !isStr(x.sourceTitle)) return false;
  if (typeof x.displayBundleId !== 'undefined' && !isStr(x.displayBundleId)) return false;
  if (typeof x.displayBundleLabel !== 'undefined' && !isStr(x.displayBundleLabel)) return false;
  if (!isStr(x.title)) return false;
  if (!isStr(x.type) || !ACTIVITY_TYPES.has(x.type)) return false;
  if (!isStr(x.details)) return false;
  if (!isStr(x.facilitatorLabel)) return false;
  if (!isStr(x.location)) return false;
  if (!isBool(x.isRemote)) return false;
  if (!isArr(x.prep) || !x.prep.every(isStr)) return false;
  if (!isArr(x.metrics) || !x.metrics.every(isStr)) return false;
  if (!isNum(x.durationMinutes) || x.durationMinutes < 0) return false;
  if (!isArr(x.boundResources) || !x.boundResources.every(isBoundResource)) return false;
  if (typeof x.skipAdjustment !== 'undefined' && !isStr(x.skipAdjustment)) return false;
  if (!isStr(x.reason)) return false;
  return true;
}

export function isScheduleResult(x: unknown): x is ScheduleResult {
  if (!isObj(x)) return false;
  if (!isDateStr(x.windowStart) || !isDateStr(x.windowEnd)) return false;
  if (!isArr(x.occurrences) || !x.occurrences.every(isScheduledOccurrence)) return false;
  return true;
}

// === 012: AllocationTrace guards ===

const FAILED_CONSTRAINT_KINDS = new Set<string>([
  'travel',
  'equipment',
  'specialist',
  'alliedHealth',
  'remoteRequired',
  // 015 — temporal kinds.
  'memberBusy',
  'actionOverlap',
  'temporalRule',
  'outsidePreferredWindow',
]);

export function isFailedConstraint(x: unknown): x is FailedConstraint {
  // 012: object + kind in the closed union + non-empty detail + optional role/resourceId.
  if (!isObj(x)) return false;
  if (!isStr(x.kind) || !FAILED_CONSTRAINT_KINDS.has(x.kind)) return false;
  if (!isStr(x.detail) || x.detail.length === 0) return false;
  if (typeof x.role !== 'undefined' && !isStr(x.role)) return false;
  if (typeof x.resourceId !== 'undefined' && !isStr(x.resourceId)) return false;
  return true;
}

export function isAllocationAttempt(x: unknown): x is AllocationAttempt {
  // 012: structured attempt record; boundResources empty when !feasible,
  // failedConstraints empty when feasible (we still validate shape, not invariants).
  if (!isObj(x)) return false;
  if (!isStr(x.candidateActivityId)) return false;
  if (!isBool(x.isPrimary)) return false;
  if (!isBool(x.feasible)) return false;
  if (!isArr(x.boundResources) || !x.boundResources.every(isBoundResource)) return false;
  if (!isArr(x.failedConstraints) || !x.failedConstraints.every(isFailedConstraint)) return false;
  if (typeof x.isRemote !== 'undefined' && !isBool(x.isRemote)) return false;
  if (typeof x.location !== 'undefined' && !isStr(x.location)) return false;
  if (typeof x.candidateDate !== 'undefined' && !isDateStr(x.candidateDate)) return false;
  if (typeof x.candidateStartTime !== 'undefined' && !isLocalTime(x.candidateStartTime)) return false;
  if (typeof x.candidateEndTime !== 'undefined' && !isLocalTime(x.candidateEndTime)) return false;
  if (typeof x.score !== 'undefined' && !isNum(x.score)) return false;
  if (typeof x.policySource !== 'undefined' && !POLICY_SOURCES.has(x.policySource as string)) return false;
  return true;
}

export function isAllocationTrace(x: unknown): x is AllocationTrace {
  // 012: one trace per slot — occurrenceId pairs 1:1 with ScheduledOccurrence.id.
  if (!isObj(x)) return false;
  if (!isStr(x.occurrenceId)) return false;
  if (!isStr(x.sourceActivityId)) return false;
  if (!isDateStr(x.targetDate)) return false;
  if (!isArr(x.attempts) || !x.attempts.every(isAllocationAttempt)) return false;
  if (x.chosenIndex !== null && !(typeof x.chosenIndex === 'number' && Number.isFinite(x.chosenIndex))) return false;
  if (!isStr(x.status) || !STATUSES.has(x.status)) return false;
  return true;
}

export function isScheduleDiagnostics(x: unknown): x is ScheduleDiagnostics {
  // 012: sibling diagnostics object; windowStart/windowEnd mirror ScheduleResult.
  if (!isObj(x)) return false;
  if (!isDateStr(x.windowStart) || !isDateStr(x.windowEnd)) return false;
  if (!isArr(x.traces) || !x.traces.every(isAllocationTrace)) return false;
  return true;
}

export function isScheduleDebugResult(x: unknown): x is ScheduleDebugResult {
  // 012: combined `{ result, diagnostics }` boundary type.
  if (!isObj(x)) return false;
  if (!isScheduleResult(x.result)) return false;
  if (!isScheduleDiagnostics(x.diagnostics)) return false;
  return true;
}

// === 015: SchedulingSemanticHints guards + reference validation ===

function isConfidence(x: unknown): x is number {
  return isNum(x) && x >= 0 && x <= 1;
}

export function isActivityTemporalPolicyHint(x: unknown): x is ActivityTemporalPolicyHint {
  if (!isObj(x)) return false;
  if (!isStr(x.activityId) || x.activityId.length === 0) return false;
  if (!isActivityTemporalPolicy(x.temporalPolicy)) return false;
  if (!isConfidence(x.confidence)) return false;
  if (!isStr(x.rationale)) return false;
  return true;
}

export function isBusyBlockClassification(x: unknown): x is BusyBlockClassification {
  if (!isObj(x)) return false;
  if (!isStr(x.busyBlockId) || x.busyBlockId.length === 0) return false;
  if (!isStr(x.category) || !MEMBER_BUSY_CATEGORIES.has(x.category)) return false;
  if (!isBool(x.blocksScheduling) || !isBool(x.visibleByDefault)) return false;
  if (!isConfidence(x.confidence)) return false;
  if (!isStr(x.rationale)) return false;
  return true;
}

export function isTemporalRuleHint(x: unknown): x is TemporalRuleHint {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || x.id.length === 0) return false;
  if (!isArr(x.appliesToActivityIds) || !x.appliesToActivityIds.every(isStr)) return false;
  if (!isBool(x.hard)) return false;
  if (typeof x.avoidAfter !== 'undefined' && (!isArr(x.avoidAfter) || !x.avoidAfter.every(isTemporalAvoidRule))) return false;
  if (typeof x.avoidBefore !== 'undefined' && (!isArr(x.avoidBefore) || !x.avoidBefore.every(isTemporalAvoidRule))) return false;
  if (!isStr(x.rationale)) return false;
  return true;
}

const WARNING_SEVERITIES = new Set<string>(['info', 'warning', 'error']);
export function isSemanticWarning(x: unknown): x is SemanticWarning {
  if (!isObj(x)) return false;
  if (!isStr(x.severity) || !WARNING_SEVERITIES.has(x.severity)) return false;
  if (typeof x.targetId !== 'undefined' && !isStr(x.targetId)) return false;
  if (!isStr(x.message)) return false;
  return true;
}

export function isSchedulingSemanticHints(x: unknown): x is SchedulingSemanticHints {
  if (!isObj(x)) return false;
  if (!isStr(x.generatedAt)) return false;
  if (typeof x.model !== 'undefined' && !isStr(x.model)) return false;
  if (!isArr(x.activityPolicies) || !x.activityPolicies.every(isActivityTemporalPolicyHint)) return false;
  if (!isArr(x.busyBlockClassifications) || !x.busyBlockClassifications.every(isBusyBlockClassification)) return false;
  if (!isArr(x.globalRules) || !x.globalRules.every(isTemporalRuleHint)) return false;
  if (!isArr(x.warnings) || !x.warnings.every(isSemanticWarning)) return false;
  return true;
}

/**
 * 015 — fail-loud staleness check: every activityId / busyBlockId a hint references must
 * exist in the current fixtures. Returns a list of human-readable errors (empty = valid).
 * Callers throw at the build-time boundary so a stale scheduling-hints.json breaks the build.
 */
export function validateHintReferences(
  hints: SchedulingSemanticHints,
  activities: Activity[],
  availability: AvailabilityBundle,
): string[] {
  const activityIds = new Set(activities.map((a) => a.id));
  const busyIds = new Set(availability.memberBusy.map((m) => m.id));
  const errors: string[] = [];
  for (const h of hints.activityPolicies) {
    if (!activityIds.has(h.activityId)) errors.push(`activityPolicies references unknown activityId "${h.activityId}"`);
  }
  for (const c of hints.busyBlockClassifications) {
    if (!busyIds.has(c.busyBlockId)) errors.push(`busyBlockClassifications references unknown busyBlockId "${c.busyBlockId}"`);
  }
  for (const r of hints.globalRules) {
    for (const id of r.appliesToActivityIds) {
      if (!activityIds.has(id)) errors.push(`globalRules[${r.id}] references unknown activityId "${id}"`);
    }
  }
  return errors;
}
