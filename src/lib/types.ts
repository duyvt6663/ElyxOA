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

/** Bundled availability inputs spanning the scheduling window. See 002. */
export interface AvailabilityBundle {
  windowStart: string;
  windowEnd: string;
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
  kind: 'travel' | 'equipment' | 'specialist' | 'alliedHealth' | 'remoteRequired';
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
