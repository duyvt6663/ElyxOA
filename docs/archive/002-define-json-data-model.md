# 002 - Define JSON Data Model (Canonical)

> **This is the canonical data-model file.** Every other backlog file (003 activities,
> 004 availability, 005 scheduler, 006 calendar) consumes the types defined here.
> When a shape changes, it changes here first, then ripples outward. Treat the TypeScript
> interfaces in this file as the single source of truth.

## Goal
Lock down the JSON / TypeScript shapes for three things and one output:
1. The **action plan** — a priority-ordered list of `Activity` records (input, from 003).
2. The **availability data** — four constraint-node shapes (input, from 004).
3. The **scheduler output** — a flat list of `ScheduledOccurrence` events (produced by 005, rendered by 006).

Keep schemas explicit enough to validate and unit-test, but model **only** what the
scheduler and the calendar UI actually consume. No speculative fields.

---

## Modeling Decisions (with rationale)

These are the decisions the assignment leaves ambiguous. Each is resolved concretely
so 003/004/005/006 can proceed without re-litigating.

### D1. Frequency is structured, not free text
The assignment writes "3 times a week" as prose. The scheduler must expand that into
concrete dated occurrences deterministically, so we store it as a structured object:

```ts
interface Frequency {
  count: number;                          // occurrences per period, e.g. 3
  period: 'day' | 'week' | 'month' | 'year';
}
```

`{ count: 3, period: 'week' }` = "3 times a week". This covers daily / weekly / monthly /
yearly (the four cadences the assignment names) with one shape.

**No time-of-day, no preferred-days array.** Rationale: the scheduler only needs to place
N occurrences inside each period deterministically. We define a fixed placement rule
(see D3) instead of carrying preference data we would not act on. If a future need for
"Mondays only" appears, add `preferredWeekdays?: number[]` then — not now (Simplicity First).

### D2. Duration + whole-day slot granularity
Every activity gets a `durationMinutes` (for display and future conflict math) but the
scheduler reasons at **whole-day granularity**: at most the planned occurrences of an
activity land on a given calendar date; we do **not** model 30-minute slots or
start times.

Rationale: the assignment's conflicts are coarse — "member is travelling these dates",
"equipment blocked these dates", "specialist available these weekdays". None of those
require minute-level slotting. Whole-day granularity makes conflict detection a simple
date-membership test and keeps the calendar UI a day grid. `durationMinutes` is retained
only because it is cheap, realistic, and useful to render; the scheduler ignores it for
conflict purposes.

### D3. Deterministic occurrence placement
Frequency expansion across the 3-month window must be reproducible. Rule:
- **day**: every day in the window.
- **week**: spread `count` occurrences evenly across the 7 weekdays of each week,
  starting Monday (e.g. count=3 → Mon/Wed/Fri).
- **month**: spread `count` occurrences evenly across the days of each calendar month.
- **year**: place `count` occurrences evenly across the window's months.

This rule lives in the scheduler (005) but is **declared here** so 005 and its tests agree.
No randomness anywhere in the pipeline.

### D4. Resources are referenced by stable ID, matched by role/type
This is the key interlock between 003 (activities) and 004 (availability). An activity
declares **what kind** of resource it needs via a `ResourceRequirement`; availability
records declare **which concrete resource** is available when. The scheduler matches on
`kind` + `role`, then binds a specific resource `id`.

```ts
type ResourceKind = 'equipment' | 'specialist' | 'alliedHealth';

interface ResourceRequirement {
  kind: ResourceKind;
  role: string;        // matched against a resource's `role` field, e.g. 'physiotherapist',
                       // 'treadmill', 'cardiologist', 'sauna'. Lowercase, hyphen-free convention.
  id?: string;         // optional: pin to one specific resource. If omitted, scheduler
                       // may bind ANY available resource of (kind, role).
}
```

Rationale: pinning everything to hard IDs makes 003's authored data brittle and couples it
to 004. Matching on `(kind, role)` lets 003 say "needs a physiotherapist" while 004 owns
"Dr. Lee the physio, ID `ah-physio-01`, available Tue/Thu". The optional `id` escape hatch
covers the rare "this exact treadmill" case without forcing it everywhere.

The **facilitator** (assignment field 4, e.g. "trainer") is a human-readable label stored
as `facilitatorLabel` for display. Where the facilitator is a *constrained* resource
(a specialist or allied-health pro whose calendar we track), it ALSO appears as a
`ResourceRequirement`. A trainer that is always available (not a tracked node) stays a
label only. This avoids inventing a fifth constraint node the assignment did not ask for.

`src/lib/roles.ts` is owned here as the canonical role vocabulary:
- Equipment: `treadmill`, `rower`, `stationary-bike`, `squat-rack`, `dumbbells`,
  `kettlebell`, `cable-machine`, `sauna`, `ice-bath`, `pool`, `yoga-mat`, `foam-roller`,
  `bp-cuff`, `glucose-monitor`, `pulse-oximeter`.
- Specialists: `physician`, `cardiologist`, `endocrinologist`, `sleep-physician`,
  `dermatologist`, `psychiatrist`, `phlebotomist`.
- Allied health: `physiotherapist`, `occupational-therapist`, `dietitian`,
  `speech-therapist`, `massage-therapist`, `personal-trainer`, `health-coach`.

### D5. Backups are ID references, with explicit backup-only templates
`backupActivityIds: string[]` references other `Activity` records by `id`, in preference
order. Rationale: a backup ("walk" substituting for "run") is itself a full activity that
deserves its own frequency, resources and metrics. Inlining would duplicate that and
desync. References keep one source of truth and let a backup reuse all the normal
scheduling logic. The list is ordered: index 0 is tried first.

To avoid accidentally scheduling fallback templates as their own standalone action-plan items,
each activity has `isBackupOnly: boolean`:
- `false` = normal action-plan activity; frequency is expanded by the scheduler.
- `true` = fallback template; never expanded as a primary slot, but may be used when referenced
  from another activity's `backupActivityIds`.

The assignment floor of 100 activities applies to normal action-plan activities
(`isBackupOnly:false`). Backup-only templates are allowed in addition to that floor.

### D6. Remote handling
```ts
canBeRemote: boolean;
```
When `true`, the activity can run remotely **only when travel/member-away would otherwise block
it**. In that remote fallback mode, the occurrence bypasses local physical-location and
equipment requirements, but still respects the **specialist / allied-health person's**
availability. When the member is not away, the scheduler treats the activity normally and applies
its resource requirements. When `false`, all constraints apply and travel blocks the activity.
This single boolean is enough; we do not model partial-remote or per-resource remote flags.

### D7. ID strategy
All IDs are stable, deterministic, human-readable strings assigned by the data authors
(003/004), never generated at runtime:
- Activities: `act-<zero-padded-seq>` → `act-001`, `act-002`, … `act-137`.
- Equipment: `eq-<slug>-<seq>` → `eq-treadmill-01`.
- Specialists: `sp-<slug>-<seq>` → `sp-cardiologist-01`.
- Allied health: `ah-<slug>-<seq>` → `ah-physio-01`.
- Travel: `tr-<seq>` → `tr-001`.
- Scheduler occurrences: `occ-<activityId>-<ISOdate>` → `occ-act-001-2026-06-01`
  (deterministic from inputs, so output is reproducible and diffable).

### D8. The 3-month window is fixed
Hard-coded for determinism (assignment + 004 both require a fixed range):
```ts
const WINDOW_START = '2026-06-01'; // inclusive
const WINDOW_END   = '2026-08-31'; // inclusive
```
All dates are `YYYY-MM-DD` strings (ISO date, no time zone, no clock). One string format
everywhere kills an entire class of parsing bugs.

### D9. Availability: explicit date-range windows, not recurring rules
Each availability shape is modeled as a list of **`DateRange` windows** with a polarity
(`available` vs `blocked`) rather than recurring weekly rules. Rationale: date ranges are
trivial to author for a fixed 3-month window, trivial to test (date-in-range check), and
trivially render conflicts. Recurring-rule expansion (RRULE) is real complexity the
assignment does not need. Travel and equipment are naturally **blocked** ranges;
specialists and allied health are naturally **available** ranges (a window list = "only
these days"). The scheduler treats them per D6 / D4.

### D10. Validation: hand-rolled type guards (no zod)
Use plain TypeScript type-guard functions (`isActivity`, `isAvailabilityBundle`, …) that
assert required fields exist and have the right primitive type. Rationale: the only
verification the assignment demands is "records missing required fields fail validation".
A handful of guard functions satisfy that with **zero dependencies**, fast tests, and no
schema-DSL learning curve. Adding zod would be speculative weight for a static-fixtures
app. (Revisit only if fixtures grow user-editable.)

---

## Type Definitions

### Activity (input — authored by 003)
```ts
type ActivityType =
  | 'fitness'        // Fitness routine / exercise (incl. eye exercise)
  | 'food'           // Food consumption
  | 'medication'     // Medication consumption
  | 'therapy'        // Therapy (sauna / ice bath)
  | 'consultation';  // Consultation

interface Activity {
  id: string;                       // D7, e.g. 'act-001'
  type: ActivityType;
  title: string;                    // short display name, e.g. 'Zone-2 Run'
  details: string;                  // assignment field 3, e.g. 'Maintain HR 120-140'
  frequency: Frequency;             // D1
  durationMinutes: number;          // D2 (display only)
  priority: number;                 // 1 = most important to health; lower = higher priority
  isBackupOnly: boolean;            // D5 — true = fallback template, not primary-expanded
  facilitatorLabel: string;         // assignment field 4, human-readable, e.g. 'Trainer'
  locations: string[];              // assignment field 5, e.g. ['gym', 'home']
  canBeRemote: boolean;             // D6
  prep: string[];                   // assignment field 7, e.g. ['Meal cooked night before']
  resources: ResourceRequirement[]; // D4 — tracked constraint resources this activity needs
  backupActivityIds: string[];      // D5, preference-ordered
  skipAdjustment: string;           // assignment field 9, e.g. 'Add 10 min to next session'
  metrics: string[];                // assignment field 10, e.g. ['Avg HR', 'Distance km']
}
```
`priority` uses ascending = more important (1 is top) so the scheduler sorts naturally.

### Frequency — see D1. ResourceRequirement — see D4.

### Availability bundle (input — authored by 004)
```ts
interface DateRange {
  start: string;  // 'YYYY-MM-DD' inclusive
  end: string;    // 'YYYY-MM-DD' inclusive
}

// Member travel: member is UNAVAILABLE during these ranges.
interface TravelPlan {
  id: string;             // 'tr-001'
  destination: string;    // display, e.g. 'Tokyo'
  blocked: DateRange[];   // member-away windows
}

// Equipment: a tracked physical resource; blocked = not accessible.
interface EquipmentAvailability {
  id: string;             // 'eq-treadmill-01'
  role: string;           // matched against ResourceRequirement.role, e.g. 'treadmill'
  label: string;          // display, e.g. 'Gym Treadmill #1'
  blocked: DateRange[];   // windows when this item is NOT available
}

// Specialist (doctor-level): available = the ONLY days bookable.
interface SpecialistAvailability {
  id: string;             // 'sp-cardiologist-01'
  role: string;           // e.g. 'cardiologist'
  name: string;           // display, e.g. 'Dr. A. Rao'
  available: DateRange[]; // windows when bookable
}

// Allied health (physio/OT/dietitian/speech): available = the ONLY days bookable.
interface AlliedHealthAvailability {
  id: string;             // 'ah-physio-01'
  role: string;           // e.g. 'physiotherapist'
  discipline: string;     // display label, e.g. 'Physiotherapy'
  name: string;           // display, e.g. 'J. Chen'
  available: DateRange[]; // windows when bookable
}

interface AvailabilityBundle {
  windowStart: string;                       // must equal WINDOW_START
  windowEnd: string;                         // must equal WINDOW_END
  travel: TravelPlan[];
  equipment: EquipmentAvailability[];
  specialists: SpecialistAvailability[];
  alliedHealth: AlliedHealthAvailability[];
}
```
Note the deliberate asymmetry (D9): travel/equipment carry `blocked` ranges (default =
available), specialists/allied-health carry `available` ranges (default = unavailable).
This matches real intuition and keeps each list short.

### ScheduledOccurrence (calendar event output — produced by 005, rendered by 006)
```ts
type OccurrenceStatus = 'scheduled' | 'substituted' | 'skipped';

interface BoundResource {
  kind: ResourceKind;
  id: string;       // the concrete resource bound, e.g. 'ah-physio-01'
  label: string;    // display name of that resource
}

interface ScheduledOccurrence {
  id: string;                    // D7, e.g. 'occ-act-001-2026-06-03'
  date: string;                  // 'YYYY-MM-DD' the occurrence lands on
  status: OccurrenceStatus;

  // The activity this occurrence DERIVES from (the originally-planned one).
  sourceActivityId: string;
  // The activity actually scheduled. Equals sourceActivityId when status='scheduled',
  // is a backup's id when status='substituted', undefined when status='skipped'.
  effectiveActivityId?: string;

  // Denormalized for direct rendering by 006 (no second lookup needed in the UI).
  title: string;                 // effective activity's title (or source's, if skipped)
  type: ActivityType;
  details: string;
  facilitatorLabel: string;
  location?: string;             // the chosen location, or 'remote'
  isRemote: boolean;
  prep: string[];
  metrics: string[];
  durationMinutes: number;

  boundResources: BoundResource[]; // concrete resources reserved for this occurrence
  skipAdjustment?: string;         // populated when status='skipped' (from source activity)
  reason: string;                  // human-readable explanation of the outcome,
                                   // e.g. 'Treadmill blocked; substituted Outdoor Walk'
}

interface ScheduleResult {
  windowStart: string;
  windowEnd: string;
  occurrences: ScheduledOccurrence[]; // flat, sorted by date then priority
}
```
`ScheduleResult.occurrences` is a flat list precisely so 006 can group it by day/week
without traversing nested structures. Every field 006 needs to show (type, details,
facilitator, location, remote, prep, metrics, backup/skip status) is present on the
occurrence itself.

---

## Example JSON Fixtures

### Activity (fitness, references tracked equipment + a backup)
```json
{
  "id": "act-001",
  "type": "fitness",
  "title": "Zone-2 Run",
  "details": "Maintain HR between 120-140",
  "frequency": { "count": 3, "period": "week" },
  "durationMinutes": 45,
  "priority": 1,
  "isBackupOnly": false,
  "facilitatorLabel": "Personal Trainer",
  "locations": ["gym", "outdoors"],
  "canBeRemote": false,
  "prep": ["Hydrate 1h before"],
  "resources": [{ "kind": "equipment", "role": "treadmill" }],
  "backupActivityIds": ["act-014"],
  "skipAdjustment": "Add a 4th easy session next week",
  "metrics": ["Average HR", "Distance km", "Duration"]
}
```

### Activity (remote consultation, pins a specialist role)
```json
{
  "id": "act-040",
  "type": "consultation",
  "title": "Cardiology Review",
  "details": "Review resting HR and BP trends",
  "frequency": { "count": 1, "period": "month" },
  "durationMinutes": 30,
  "priority": 2,
  "isBackupOnly": false,
  "facilitatorLabel": "Cardiologist",
  "locations": ["clinic"],
  "canBeRemote": true,
  "prep": ["Upload last 2 weeks of HR data"],
  "resources": [{ "kind": "specialist", "role": "cardiologist" }],
  "backupActivityIds": [],
  "skipAdjustment": "Reschedule within 7 days",
  "metrics": ["Resting HR", "Blood pressure"]
}
```

### AvailabilityBundle (one of each node)
```json
{
  "windowStart": "2026-06-01",
  "windowEnd": "2026-08-31",
  "travel": [
    { "id": "tr-001", "destination": "Tokyo",
      "blocked": [{ "start": "2026-06-10", "end": "2026-06-17" }] }
  ],
  "equipment": [
    { "id": "eq-treadmill-01", "role": "treadmill", "label": "Gym Treadmill #1",
      "blocked": [{ "start": "2026-07-01", "end": "2026-07-05" }] }
  ],
  "specialists": [
    { "id": "sp-cardiologist-01", "role": "cardiologist", "name": "Dr. A. Rao",
      "available": [{ "start": "2026-06-01", "end": "2026-08-31" }] }
  ],
  "alliedHealth": [
    { "id": "ah-physio-01", "role": "physiotherapist", "discipline": "Physiotherapy",
      "name": "J. Chen",
      "available": [{ "start": "2026-06-01", "end": "2026-06-30" }] }
  ]
}
```

### ScheduledOccurrence (a substitution, equipment was blocked)
```json
{
  "id": "occ-act-001-2026-07-03",
  "date": "2026-07-03",
  "status": "substituted",
  "sourceActivityId": "act-001",
  "effectiveActivityId": "act-014",
  "title": "Outdoor Walk",
  "type": "fitness",
  "details": "Brisk walk, keep HR 110-130",
  "facilitatorLabel": "Self",
  "location": "outdoors",
  "isRemote": false,
  "prep": [],
  "metrics": ["Steps", "Duration"],
  "durationMinutes": 45,
  "boundResources": [],
  "reason": "Treadmill eq-treadmill-01 blocked 2026-07-01..07-05; substituted backup act-014"
}
```

---

## Validation Approach
Hand-rolled type guards (D10), one per top-level shape, in a single `validate.ts`:
- `isActivity(x): x is Activity` — asserts all required fields present + correct primitive
  type, `type` is one of the five, `frequency.period` is one of the four, arrays are arrays,
  and `isBackupOnly` is boolean.
- `isAvailabilityBundle(x): x is AvailabilityBundle` — checks window dates, all four node arrays,
  every record in each array, every date range, and role strings against `roles.ts`.
- `isScheduleResult(x)` — checks `occurrences` is an array of well-formed occurrences.
A Vitest test feeds (a) the real fixtures → expect pass, and (b) records with a
required field deleted → expect fail. That is exactly the assignment's verification bar.

---

## Tasks
1. Create `src/lib/types.ts` containing every interface/type above, exported.
2. Create `src/lib/constants.ts` exporting `WINDOW_START`, `WINDOW_END`.
3. Create `src/lib/roles.ts` exporting `EQUIPMENT_ROLES`, `SPECIALIST_ROLES`,
   `ALLIED_HEALTH_ROLES`, and their string-literal union types.
4. Create `src/lib/validate.ts` with `isActivity`, `isAvailabilityBundle`, `isScheduleResult`.
5. Add the four example fixtures above as committed JSON under `src/data/examples/`
   (one activity-fitness, one activity-consultation, one availability bundle, one occurrence)
   for use in tests and as authoring references for 003/004.
6. Add a test (`src/lib/validate.test.ts`) asserting valid fixtures pass and
   field-stripped clones fail.

---

## Open Questions / Decisions Needed
Contestable points, each with a **recommended default** already applied above so work is
not blocked. Flag for review; do not re-open unless a reviewer objects.

1. **Whole-day vs timed slots (D2).** Recommended default: **whole-day**. Risk: cannot
   express "no two activities at 9am". The assignment's constraints are all day-level, so
   this is accepted. *Decision needed only if a reviewer wants intra-day conflict modeling.*
2. **Resource matching by `(kind, role)` vs hard IDs (D4).** Recommended default:
   **role-based with optional `id` pin**. Risk: a role typo in 003 silently fails to match a
   004 resource. Mitigation: shared `role` vocabulary documented here; validation/tests must
   cross-check activities, roles, and availability providers before scheduling.
3. **Member's own calendar ("Client's Schedule" node).** The PDF diagram shows a fifth
   node, *Client's Schedule*, separate from Travel. Recommended default: **fold it into
   `TravelPlan` blocked ranges** (any member-unavailable period, travel or not) and do
   **not** add a fifth shape. Risk: loses semantic distinction between "travelling" and
   "busy". Accepted under Simplicity First; revisit only if a reviewer wants them split.

---

## Interfaces Provided To Other Files
Explicit contract so downstream agents stay consistent:

| File | Consumes / Produces | Types it depends on |
|------|---------------------|---------------------|
| **003 sample activities** | produces `Activity[]` | `Activity`, `ActivityType`, `Frequency`, `ResourceRequirement`; must use D7 IDs and the shared `role` vocabulary |
| **004 availability data** | produces `AvailabilityBundle` | `AvailabilityBundle`, `TravelPlan`, `EquipmentAvailability`, `SpecialistAvailability`, `AlliedHealthAvailability`, `DateRange`; window dates from D8; roles must match 003 |
| **005 scheduler** | consumes `Activity[]` + `AvailabilityBundle`, produces `ScheduleResult` | all input types + `ScheduledOccurrence`, `ScheduleResult`, `BoundResource`, `OccurrenceStatus`; implements placement rule D3, matching D4, remote logic D6 |
| **006 render calendar** | consumes `ScheduleResult` | `ScheduleResult`, `ScheduledOccurrence`, `OccurrenceStatus`, `ActivityType` — reads denormalized fields only, no lookups |

---

## Verification
- `src/lib/types.ts` compiles under `tsc --noEmit` with `strict: true`.
- A fixture exists for **all five** `ActivityType` values (covered across 003 + examples).
- An `AvailabilityBundle` fixture populates **all four** node arrays.
- `isActivity` / `isAvailabilityBundle` return `false` for clones with any one required
  field removed, and `true` for the committed example fixtures (asserted in tests).
- Every `ScheduledOccurrence` field that 006 renders is denormalized onto the occurrence
  (no `Activity` lookup required at render time) — verified by 006 importing only
  `ScheduleResult`.
- Window dates in every fixture equal `WINDOW_START` / `WINDOW_END`.
