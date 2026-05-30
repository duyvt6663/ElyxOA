# 005 - Build Scheduler Engine

## Goal

Implement the core of the Elyx Resource Allocator: a **pure, deterministic** function that turns a priority-ordered health action plan (`Activity[]`) plus member availability constraints (`AvailabilityBundle`) into a personalized 3-month calendar (`ScheduleResult`). The scheduler is **runtime-agnostic**: the required baseline app calls it during static route render, tests call it directly, and optional future import/edit flows can call it in browser state. No backend, no runtime mutation, no I/O inside the scheduler.

This is the most algorithmically important file in the project. Every decision below is locked unless listed under **Open Questions / Decisions Needed**.

---

## Scheduler Contract

```ts
// src/lib/scheduler.ts
export function schedule(
  activities: Activity[],
  availability: AvailabilityBundle
): ScheduleResult;
```

- **Pure**: no `Date.now()`, no `Math.random()`, no network, no filesystem. Same input -> byte-identical output.
- **When**: invoked by the baseline static route for committed fixtures, and directly by tests. Optional stretch work may invoke the same function client-side for imported JSON; the algorithm must not depend on its call site.
- **Window**: hard-coded canonical `WINDOW_START = '2026-06-01'`, `WINDOW_END = '2026-08-31'` (inclusive). The function reads `availability.windowStart/windowEnd` but the fixtures match the canon.
- **Granularity**: whole-day. There are no intra-day time slots; a resource is either usable on a given calendar date or not.
- **Date math**: all dates are `YYYY-MM-DD` strings interpreted as UTC calendar days to avoid timezone drift. Helpers operate on day indices (days since `WINDOW_START`).

---

## Algorithm (high level)

```
schedule(activities, availability):
  1. EXPAND   each non-backup-template activity's frequency -> deterministic list of target dates in [windowStart, windowEnd]
  2. ORDER    build a flat list of (activity, date) "slots"; sort by total order (priority, activityId, date)
  3. ALLOCATE for each slot, greedily:
       a. try the PRIMARY activity on that date (constraint check + resource binding)
       b. if blocked, walk backupActivityIds in preference order, re-checking each on that date
       c. if a backup succeeds -> status 'substituted' (effectiveActivityId = backup id)
          if primary succeeds  -> status 'scheduled'
          if none feasible     -> status 'skipped' (carry skipAdjustment + reason)
       d. on success, COMMIT bound resource ids to the per-day ledger
  4. ASSEMBLE denormalized ScheduledOccurrence per slot
  5. SORT     occurrences by (date, priority) and return ScheduleResult
```

Greedy, single pass over a priority-sorted slot list. No backtracking. See **Known Limitations**.

---

## Frequency Expansion Rules

Goal: turn `Frequency = {count, period}` into a deterministic, evenly-spread set of dates inside the window. We anchor placement to the **window**, not to arbitrary calendar boundaries, so spacing is stable and reproducible.

Let `W = [windowStart .. windowEnd]` (92 days for the canon). Define `dayIndex(d)` = days since `windowStart`.

| period  | count   | Rule (deterministic) |
|---------|---------|----------------------|
| `day`   | 1       | Every day in `W`. |
| `day`   | n>1     | Every day in `W`; `n` occurrences **per day** collapse to 1 at whole-day granularity (see note). |
| `week`  | 1       | Once per week bucket; placed on the **Monday** of each week within `W` (clamped to `windowStart`). |
| `week`  | n (1..7)| `n` evenly-spaced weekdays per week using the fixed slot map below. |
| `month` | 1       | The **1st** of each month in `W` (clamped to `windowStart` for the partial first month). |
| `month` | n>1     | `n` evenly-spaced days per month: `day = floor(1 + k*(28/n))` for k=0..n-1 (cap at 28 so the day exists in every month). |
| `year`  | 1       | Include **once** if the activity's anchor falls in `W`. Anchor = `windowStart` (first eligible day), so a yearly item lands on `windowStart`. |
| `year`  | n>1     | `n` evenly-spaced days across the whole window: `windowStart + round(k*(len(W)-1)/(n-1))` for k=0..n-1. |

**Weekday slot map for `week`/n** (1=Mon … 7=Sun), chosen to spread load and avoid weekend bias:

| n | weekdays |
|---|----------|
| 1 | Mon |
| 2 | Mon, Thu |
| 3 | Mon, Wed, Fri |
| 4 | Mon, Tue, Thu, Fri |
| 5 | Mon, Tue, Wed, Thu, Fri |
| 6 | Mon..Sat |
| 7 | Mon..Sun |

Notes:
- **`day`/n>1**: whole-day granularity cannot represent multiple distinct same-day occurrences, so they collapse to one occurrence/day. Recorded as a known limitation; if it matters, model it as separate activities. (Recommended default: collapse.)
- Partial first/last weeks and months are **clamped** to the window: any computed date `< windowStart` or `> windowEnd` is dropped (not shifted), so we never schedule outside the window.
- Expansion is computed purely from `count`, `period`, and the window — no resource info — so it is identical across runs.

---

## Constraint Semantics (per occurrence date)

A candidate (activity, date) is **feasible** iff ALL of the following pass. The model is **asymmetric** by node type:

### 1. Travel (member presence)
- Member is **away** if `date` falls inside any `TravelPlan.blocked` range.
- If away:
  - In-person execution is **blocked**.
  - The activity may still run **iff `activity.canBeRemote === true`** (it becomes a remote occurrence -> `isRemote = true`, `location = 'remote'`).
- If not away: `isRemote = false`, normal location applies.

### 2. Equipment (available-by-default, blocked-windows)
- For each `ResourceRequirement` with `kind === 'equipment'`:
  - Match `EquipmentAvailability` by `role`; if the requirement pins `id`, only that item matches.
  - Equipment is **usable on `date`** if `date` is NOT inside any of its `blocked` ranges.
  - The requirement is satisfied if **at least one** matching, non-blocked, not-already-booked item exists.
- **Remote bypass**: if the member is away and `canBeRemote` lets the occurrence run remotely, physical equipment + physical-location requirements are **bypassed**. If the member is not away, the activity is scheduled normally and equipment requirements still apply.

### 3. Specialist / Allied Health (bookable-only-inside-windows)
- For each requirement with `kind === 'specialist'` or `'alliedHealth'`:
  - Match by `role`; optional `id` pins one.
  - The resource is **bookable on `date`** only if `date` falls inside one of its `available` ranges (NOT available-by-default).
  - Satisfied if at least one matching, in-window, not-already-booked resource exists.
- **Remote does NOT bypass specialist/allied availability.** Rationale: a remote consult still consumes the professional's calendar — the constraint represents bookable clinician time, independent of the member's physical location. A remote cardiology consult still requires the cardiologist's `available` window to include the date. (Locked default.)

### Remote interaction summary
| node            | remote occurrence behavior |
|-----------------|----------------------------|
| travel          | remote is the *fallback mechanism* that lets an away-member proceed |
| equipment       | **bypassed only for remote travel fallback** |
| location        | `isRemote = true`, location set to `'remote'` |
| specialist      | **still required** (consumes pro's calendar) |
| alliedHealth    | **still required** (consumes pro's calendar) |

---

## Resource Binding & Capacity

**Decision (locked): every specialist, allied-health professional, and equipment item is EXCLUSIVE — at most one booking per resource per day.** Whole-day granularity cannot prove two activities fit, so the safe, simplest, defensible rule is one-booking-per-resource-per-day.

- A per-day **ledger** tracks `bookedResourceIds: Set<string>` keyed by date.
- During constraint check, a matching resource is eligible only if its `id` is not already in that date's ledger.
- On a successful schedule/substitute, the chosen resource ids are added to the ledger and recorded in the occurrence's `boundResources`.
- **Booking order is deterministic**: slots are processed in `(priority, activityId, date)` order, so higher-priority activities claim scarce resources first.
- Within a single occurrence, when multiple matching resources are free, bind the one with the **lexicographically smallest id** (stable, reproducible).

Why exclusive: it surfaces the engineered conflicts (narrow cardiologist window, allied-health gaps) instead of silently over-booking; it is the conservative real-world assumption (one clinician-activity per day-slot here); and it keeps the model trivially explainable. Capacity tuning is a future enhancement, not needed for the assignment.

---

## Greedy Allocation (detail)

For each slot `(activity A, date D)` in total order:

1. **Primary attempt**: run the constraint check for `A` on `D`.
   - If feasible: bind resources, emit `status: 'scheduled'`, `sourceActivityId = A.id`, `effectiveActivityId = A.id`, `reason = "scheduled as planned"`.
2. **Backup chain**: if primary blocked, iterate `A.backupActivityIds` in order. For each backup id `B`:
   - Resolve `B` to its `Activity`. Re-run the full constraint check for `B` on `D` (a backup may have different resources / `canBeRemote`).
   - First feasible backup wins: bind its resources, emit `status: 'substituted'`, `sourceActivityId = A.id`, `effectiveActivityId = B.id`, denormalize **B's** fields, `reason = "primary blocked (<why>); substituted backup <B.id>"`.
3. **Skip**: if neither primary nor any backup is feasible, emit `status: 'skipped'`, `sourceActivityId = A.id`, `effectiveActivityId` unset, `skipAdjustment = A.skipAdjustment`, denormalize A's fields, `reason` = human-readable cause (e.g. `"member travelling 06-22..06-29 and activity not remote-capable; no backup feasible"`).

The `reason` string is always populated for explainability in the UI. Activities marked
`isBackupOnly: true` are never expanded as primary slots; they are only eligible through a
primary activity's `backupActivityIds`.

---

## Determinism & Tie-Breaking

- **Total order on slots**: `(priority ASC, activityId ASC, date ASC)`. Priority 1 = highest, processed first. This governs scarce-resource contention.
- All sorts are **stable** and key off the total order; no reliance on input array order.
- Resource selection tie-break: smallest `id` lexicographically.
- No wall-clock, no RNG, no locale-dependent collation (plain ASCII string compare + UTC date arithmetic).
- **Output sort**: occurrences sorted by `(date ASC, source activity priority ASC)` for the calendar; ties within a day fall back to `(activityId, sourceActivityId)` to stay total.
- Occurrence ids: `occ-<sourceActivityId>-<date>` (deterministic; unique because there is at most one occurrence per activity per date after expansion).

---

## Output Shape (recap — owned by 002, do NOT extend)

Per slot we emit exactly one `ScheduledOccurrence`:
```
{ id, date, status, sourceActivityId, effectiveActivityId?,
  title, type, details, facilitatorLabel, location, isRemote,
  prep, metrics, durationMinutes, boundResources[], skipAdjustment?, reason }
```
Denormalized fields come from the **effective** activity (backup when substituted, else primary). Wrapped in:
```
{ windowStart, windowEnd, occurrences: ScheduledOccurrence[] }  // flat, sorted by date then priority
```
No new fields are introduced by this engine.

---

## Known Limitations (accepted simplifications)

1. **Greedy ≠ globally optimal.** A high-priority activity can consume the only instance of a shared resource on a date, forcing a lower-priority activity that *also* needed it to skip — even if a different global assignment would have satisfied both. Accepted: the brief asks for a simple, explainable scheduler, not an ILP solver.
2. **Exclusive per-day capacity** may over-block when a resource could realistically serve several activities a day. Accepted for safety/simplicity; capacity is a future knob.
3. **`day`/count>1 collapses** to one occurrence/day (no sub-day slots).
4. **No re-flow**: a skipped occurrence is not deferred to a later open date. Skips are reported with `skipAdjustment`, not rescheduled. (See Open Questions.)
5. **No partial fulfillment**: an activity needing multiple resources is all-or-nothing on a date.

---

## Test Plan (Vitest, tiny fixtures, one scenario each)

All fixtures use the canonical window. Each test asserts the **status sequence** (and `effectiveActivityId` / `boundResources` / `isRemote` where relevant).

1. **`schedules with no conflicts`** — single weekly/3 fitness activity, all resources available all window. Expect every expanded date -> `scheduled`, correct Mon/Wed/Fri placement, no skips.
2. **`skips in-person activity during travel`** — activity with `canBeRemote: false`, travel block `06-22..06-29`. Expect occurrences inside the block -> `skipped` with `skipAdjustment`; outside -> `scheduled`.
3. **`substitutes to remote during travel`** — activity with `canBeRemote: true` over the same travel block. Expect in-block occurrences to run with `isRemote: true`, `location: 'remote'`, equipment bypassed, status `scheduled`; assert `isRemote` flips only inside the block.
4. **`uses backup when equipment under maintenance`** — treadmill-run primary needs equipment role `treadmill` blocked `07-06..07-12`; backup `outdoor-run` needs no equipment. Expect in-block occurrences -> `substituted`, `effectiveActivityId = outdoor-run`; outside -> primary `scheduled`.
5. **`schedules consult only in narrow specialist window`** — cardiology consult, cardiologist `available` only `07-01..07-03` and `08-01..08-03`. A monthly/1 expansion lands on the first of each month; assert July/August bind the cardiologist id and June skips if no backup exists.
6. **`skips during allied-health leave gap`** — physio therapy, allied-health `available` has a gap (on leave). Expect occurrences in the gap -> `skipped` (or `substituted` if a backup exists); flanking dates -> `scheduled`.
7. **`skips when backup chain is exhausted`** — primary blocked by travel (`canBeRemote:false`) AND its single backup also `canBeRemote:false`/blocked on the same dates. Expect `skipped`, `reason` mentions exhausted backups, `skipAdjustment` carried.
8. **`is deterministic / idempotent`** — run `schedule(...)` twice on the same fixture; assert deep-equal output. Also assert that **shuffling the input `activities` array** yields identical output (order-independence via the total order).
9. **`enforces exclusive resource capacity`** — two activities (priority 1 and 2) both require the same single specialist/equipment on the same date. Expect priority-1 -> `scheduled` (binds the resource), priority-2 -> `substituted` if it has a backup, else `skipped`. Verifies booking order + ledger.
10. **`does not expand backup-only templates`** — an activity with `isBackupOnly:true` never appears as its own source occurrence, but can appear as `effectiveActivityId` when referenced as a backup.

---

## Open Questions / Decisions Needed

1. **Should skipped occurrences be deferred/re-flowed to the next open day?**
   *Recommended default:* **No.** Report the skip with `skipAdjustment`; deferral adds re-flow complexity and can cascade. Revisit only if the demo needs it.
2. **Specialist/allied capacity — exclusive vs. multi-booking per day? — RESOLVED.**
   **Decision: Exclusive (one booking per resource per day)**, applied to specialists, allied health, AND equipment, allocated in `(priority, activityId, date)` order. Chosen to deliberately surface resource contention so the priority/backup/skip adaptation is demonstrable — not just availability-window conflicts. Implement as a single capacity constant so it can be relaxed later without restructuring.
3. **Yearly-count=1 anchor — `windowStart` vs. an activity-provided anchor date?**
   *Recommended default:* **`windowStart`.** The data model has no per-activity anchor field; anchoring to the window keeps expansion purely a function of `(count, period, window)`. If fixtures later add an anchor, switch then.

(Lesser settled defaults, not blocking: weekday slot map as tabled; remote travel fallback bypasses equipment but not specialists; tie-break by smallest id.)

---

## Verification (sharpened)

- [ ] `schedule` is a pure function — no `Date.now()`, `Math.random()`, or I/O (lint/grep check + idempotency test #8).
- [ ] Frequency expansion matches the table exactly for `day/week/month/year` and counts, excluding `isBackupOnly:true` templates from primary expansion (unit-tested per row used in fixtures).
- [ ] All expanded dates lie within `[windowStart, windowEnd]` (clamping verified).
- [ ] Travel: in-person blocked when away; remote allowed iff `canBeRemote` (tests #2, #3).
- [ ] Equipment: blocked-window honored; remote bypasses equipment (tests #3, #4).
- [ ] Specialist/allied: bookable only inside `available`; remote does NOT bypass (tests #5, #6).
- [ ] Backup chain walked in preference order; first feasible wins; `effectiveActivityId` set (test #4).
- [ ] Exhausted chain -> `skipped` with `skipAdjustment` + `reason` (test #7).
- [ ] Exclusive per-day capacity enforced in priority order (test #9).
- [ ] Output sorted by `(date, priority)`; ids deterministic; idempotent + order-independent (test #8).
