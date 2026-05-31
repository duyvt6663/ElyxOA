/**
 * DECISION RECAP — 002 Define JSON Data Model
 * - Scheduling window locked to 2026-06-01..2026-08-31 (inclusive, whole-day granularity).
 * - Frequency uses {count, period} with period in {day, week, month, year}.
 * - ResourceRequirement matches by (kind, role); optional id pins a specific instance.
 * - ActivityType is a closed union: fitness | food | medication | therapy | consultation.
 * - Activity priority is a unique int (1 = highest); backupActivityIds are preference-ordered ID refs.
 * - isBackupOnly activities are never expanded as primary (D5).
 * - Availability is asymmetric:
 *     travel.blocked = member unavailable;
 *     equipment.blocked = usable by default except during blocked;
 *     specialist/alliedHealth.available = only bookable inside available windows.
 * - ScheduledOccurrence is denormalized for direct UI rendering.
 * - ScheduleResult.occurrences sorted by (date, priority).
 */

/**
 * PSEUDO-ALGORITHM
 * N/A — pure type declarations + window constants.
 */

/** Canonical scheduling window start (inclusive, YYYY-MM-DD). See 002. */
export const WINDOW_START = '2026-06-01' as const;

/** Canonical scheduling window end (inclusive, YYYY-MM-DD). See 002. */
export const WINDOW_END = '2026-08-31' as const;

/** Inclusive date range with whole-day granularity. See 002. */
export interface DateRange {
  start: string;
  end: string;
}

/** Cadence specification for an Activity. See 002. */
export interface Frequency {
  count: number;
  period: 'day' | 'week' | 'month' | 'year';
}

/** Closed union of activity categories. See 002. */
export type ActivityType =
  | 'fitness'
  | 'food'
  | 'medication'
  | 'therapy'
  | 'consultation';

/** Closed union of resource kinds used for (kind, role) matching. See 002. */
export type ResourceKind = 'equipment' | 'specialist' | 'alliedHealth';

/** A resource requirement declared by an Activity; matched by (kind, role). See 002. */
export interface ResourceRequirement {
  kind: ResourceKind;
  role: string;
  id?: string;
}

/**
 * DECISION RECAP — 015 Temporal Availability & Scheduling
 * - Local wall-clock time at 30-minute granularity; no cross-timezone conversion in V1.
 * - TimeBlock never crosses midnight; split overnight (22:30-23:59 + 00:00-06:30).
 * - AvailabilityBundle gains `timeZone` (home default) + `memberBusy` occupied blocks.
 * - Activity gains optional `temporalPolicy`; getDefaultTemporalPolicy() supplies the rest.
 * - ScheduledOccurrence gains startTime/endTime/timeZone (scheduled/substituted only).
 * - Diagnostics gain candidate times, score, and temporal FailedConstraint kinds.
 */

/** HH:MM 24-hour local wall-clock time. Validator rejects hh>23 / mm>59 (incl. 24:00). See 015. */
export type LocalTime = `${number}${number}:${number}${number}`;

/** A bounded interval on one date; never crosses midnight. `timeZone` overrides the bundle default. See 015. */
export interface TimeBlock {
  /** YYYY-MM-DD */
  date: string;
  startTime: LocalTime;
  endTime: LocalTime;
  /** Defaults to AvailabilityBundle.timeZone; set for travel-local blocks. */
  timeZone?: string;
}

/** Member occupied time (sleep/work/meal/...). `blocksScheduling` gates overlap rejection. See 015. */
export interface MemberBusyBlock {
  id: string;
  title: string;
  category:
    | 'sleep'
    | 'work'
    | 'commute'
    | 'meal'
    | 'family'
    | 'travel'
    | 'personal'
    | 'clinical'
    | 'buffer';
  blocks: TimeBlock[];
  blocksScheduling: boolean;
  visibleByDefault: boolean;
}

/** A named preferred placement window for an activity. See 015. */
export interface TimeBlockPreference {
  label: 'morning' | 'midday' | 'afternoon' | 'evening';
  startTime: LocalTime;
  endTime: LocalTime;
}

/** A proximity-avoidance rule: this activity avoids matching events within `withinMinutes`. See 015. */
export interface TemporalAvoidRule {
  activityType?: ActivityType;
  intensity?: 'moderate' | 'high';
  category?: MemberBusyBlock['category'];
  withinMinutes: number;
  reason: string;
}

/** Optional time-placement policy for an Activity; merged explicit > hint > default. See 015. */
export interface ActivityTemporalPolicy {
  preferredWindows: TimeBlockPreference[];
  anchor?: 'wake' | 'breakfast' | 'lunch' | 'dinner' | 'bedtime' | 'any';
  intensity?: 'none' | 'low' | 'moderate' | 'high';
  minGapBeforeMinutes?: number;
  minGapAfterMinutes?: number;
  avoidAfter?: TemporalAvoidRule[];
  avoidBefore?: TemporalAvoidRule[];
}

/** Activity declared in 003's action plan. See 002. */
export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  details: string;
  frequency: Frequency;
  durationMinutes: number;
  /** 1 = highest; unique integer across the activity set. */
  priority: number;
  facilitatorLabel: string;
  locations: string[];
  canBeRemote: boolean;
  prep: string[];
  resources: ResourceRequirement[];
  /** Preference-ordered ID refs to other activities used when this one cannot be scheduled. */
  backupActivityIds: string[];
  skipAdjustment: string;
  metrics: string[];
  /** D5 — when true, this activity is only used as a backup target and never expanded as a primary. */
  isBackupOnly: boolean;
  /** 015 — optional explicit time-placement policy; getDefaultTemporalPolicy() fills the rest. */
  temporalPolicy?: ActivityTemporalPolicy;
}

/** Travel block making the member unavailable. See 002. */
export interface TravelPlan {
  id: string;
  destination: string;
  blocked: DateRange[];
}

/** Equipment availability — usable by default except inside `blocked`. See 002. */
export interface EquipmentAvailability {
  id: string;
  role: string;
  label: string;
  blocked: DateRange[];
}

/** Specialist availability — only bookable inside `available` windows. See 002. */
export interface SpecialistAvailability {
  id: string;
  role: string;
  name: string;
  available: DateRange[];
}

/** Allied-health availability — only bookable inside `available` windows. See 002. */
export interface AlliedHealthAvailability {
  id: string;
  role: string;
  discipline: string;
  name: string;
  available: DateRange[];
}

/** Bundled availability inputs spanning the scheduling window. See 002 + 015. */
export interface AvailabilityBundle {
  windowStart: string;
  windowEnd: string;
  /** 015 — home/default IANA timezone; TimeBlock.timeZone overrides per-block for travel. */
  timeZone: string;
  /** 015 — member occupied blocks (sleep/work/meal/...); empty array in the date-only baseline. */
  memberBusy: MemberBusyBlock[];
  travel: TravelPlan[];
  equipment: EquipmentAvailability[];
  specialists: SpecialistAvailability[];
  alliedHealth: AlliedHealthAvailability[];
}

/** Concrete resource binding attached to a ScheduledOccurrence. See 002. */
export interface BoundResource {
  kind: ResourceKind;
  role: string;
  id: string;
}

/** Denormalized occurrence for direct UI rendering. See 002. */
export interface ScheduledOccurrence {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 015 — local start time; present on scheduled/substituted, omitted on skipped. */
  startTime?: LocalTime;
  /** 015 — local end time = start + durationMinutes, snapped up to 30-min for occupancy. */
  endTime?: LocalTime;
  /** 015 — which local clock startTime/endTime are in; defaults to AvailabilityBundle.timeZone. */
  timeZone?: string;
  /** 015 — true when the chosen slot is outside the merged policy's preferred/anchor window
   * (emitted by the scheduler so UIs don't rederive policy semantics). */
  outsidePreferredWindow?: boolean;
  status: 'scheduled' | 'substituted' | 'skipped';
  sourceActivityId: string;
  effectiveActivityId?: string;
  title: string;
  type: ActivityType;
  details: string;
  facilitatorLabel: string;
  location: string;
  isRemote: boolean;
  prep: string[];
  metrics: string[];
  durationMinutes: number;
  boundResources: BoundResource[];
  skipAdjustment?: string;
  /**
   * Human-readable summary of why this occurrence ended up scheduled / substituted / skipped.
   * 012: human summary; see ScheduleDiagnostics.traces[].attempts for structured detail.
   */
  reason: string;
}

/** Output of `schedule(activities, availability)`; sorted by (date, priority). See 002. */
export interface ScheduleResult {
  windowStart: string;
  windowEnd: string;
  occurrences: ScheduledOccurrence[];
}

/** 012: Scheduler diagnostics — see docs/backlog/012-scheduler-diagnostics.md */

export interface FailedConstraint {
  kind:
    | 'travel'
    | 'equipment'
    | 'specialist'
    | 'alliedHealth'
    | 'remoteRequired'
    // 015 — temporal failure kinds.
    | 'memberBusy'
    | 'actionOverlap'
    | 'temporalRule'
    | 'outsidePreferredWindow';
  role?: string;
  resourceId?: string;
  detail: string;
}

export interface AllocationAttempt {
  candidateActivityId: string;
  isPrimary: boolean;
  feasible: boolean;
  boundResources: BoundResource[];
  failedConstraints: FailedConstraint[];
  isRemote?: boolean;
  location?: string;
  /** 015 — candidate slot under evaluation (date always set by the temporal scheduler). */
  candidateDate?: string;
  candidateStartTime?: LocalTime;
  candidateEndTime?: LocalTime;
  /** 015 — soft score for a feasible candidate; lower is better. */
  score?: number;
  /** 015 — provenance of the temporal policy used for this candidate. */
  policySource?: PolicySource;
}

export interface AllocationTrace {
  occurrenceId: string;
  sourceActivityId: string;
  targetDate: string;
  attempts: AllocationAttempt[];
  chosenIndex: number | null;
  status: ScheduledOccurrence['status'];
}

export interface ScheduleDiagnostics {
  windowStart: string;
  windowEnd: string;
  traces: AllocationTrace[];
}

export interface ScheduleDebugResult {
  result: ScheduleResult;
  diagnostics: ScheduleDiagnostics;
}

/**
 * 015: LLM-Assisted Semantic Compiler hint contract.
 * Generated offline (npm run generate:hints) and committed to src/data/scheduling-hints.json.
 * Validated against the live fixtures; dangling refs / low-confidence hints are rejected.
 */

/** Provenance tag for a merged policy or scored constraint. See 015. */
export type PolicySource = 'explicit' | 'default' | 'llm-hint';

export interface ActivityTemporalPolicyHint {
  activityId: string;
  temporalPolicy: ActivityTemporalPolicy;
  /** 0..1; hints below the code threshold (0.7) are ignored. */
  confidence: number;
  rationale: string;
}

export interface BusyBlockClassification {
  busyBlockId: string;
  category: MemberBusyBlock['category'];
  blocksScheduling: boolean;
  visibleByDefault: boolean;
  confidence: number;
  rationale: string;
}

export interface TemporalRuleHint {
  id: string;
  appliesToActivityIds: string[];
  hard: boolean;
  avoidAfter?: TemporalAvoidRule[];
  avoidBefore?: TemporalAvoidRule[];
  rationale: string;
}

export interface SemanticWarning {
  severity: 'info' | 'warning' | 'error';
  targetId?: string;
  message: string;
}

export interface SchedulingSemanticHints {
  generatedAt: string;
  model?: string;
  activityPolicies: ActivityTemporalPolicyHint[];
  busyBlockClassifications: BusyBlockClassification[];
  globalRules: TemporalRuleHint[];
  warnings: SemanticWarning[];
}
