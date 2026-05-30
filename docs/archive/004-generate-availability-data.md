# 004 - Generate Availability Data

## Goal

Produce a single, hand-authored JSON fixture (`src/data/availability.json`) describing the 3-month availability of every constraint node (travel, equipment, specialists, allied health) across the canonical window **2026-06-01 .. 2026-08-31** (inclusive). The data must:

1. Honor the **asymmetric availability model** fixed in 002 (blocked-by-default vs available-by-default per node kind).
2. Cover the **superset** of resource roles required by the action plan in 003 (the 003<->004 interlock).
3. Contain **deliberately engineered conflicts** that force the scheduler to skip or substitute activities — so adaptation is demonstrable and not accidental.

This is fixture authoring, not a generator. We write the JSON by hand (or with a one-shot prompt, documented below). No runtime generation, no recurring-rule engine — that would be speculative work the assignment does not need.

---

## Representation Decisions (respecting the asymmetric model)

The four node kinds use the FIXED shapes from 002. We do **not** invent fields. The asymmetry is intentional and we lean into it:

| Node | Shape | Default state | Ranges mean | Why this fits reality |
|------|-------|---------------|-------------|-----------------------|
| Travel | `TravelPlan{id, destination, blocked: DateRange[]}` | member **available** | member is **away/unavailable** during these ranges | A member is home most of the time; trips are the exceptions. |
| Equipment | `EquipmentAvailability{id, role, label, blocked: DateRange[]}` | equipment **available** | maintenance / in-use / broken — **unusable** | Gear works by default; outages are exceptions. |
| Specialist | `SpecialistAvailability{id, role, name, available: DateRange[]}` | specialist **unbookable** | the **only** windows you can book | Specialists have scarce, explicit clinic slots. |
| Allied health | `AlliedHealthAvailability{id, role, discipline, name, available: DateRange[]}` | unbookable | the **only** bookable windows | Same scarce-slot semantics as specialists. |

**Explicit DateRanges, not recurring rules.** We list a small number of literal `DateRange` objects per resource rather than encoding weekly recurrence (e.g. "every Mon/Wed"). Rationale:

- **Determinism**: the scheduler is pure; literal ranges make its output trivially reproducible and snapshot-testable. No expansion step that could drift.
- **Simplicity First**: a recurrence expander is code we'd have to write, test, and trust for zero added assignment value. The window is only 13 weeks.
- **Reviewability**: a reviewer can eyeball the JSON and predict scheduler behavior. Recurrence rules hide conflicts behind expansion logic.

Where a resource is "broadly available", we model it as a single wide range (e.g. one `available` range spanning most of the window) with one or two carved-out gaps represented as separate ranges — i.e. we list the *available* sub-windows directly rather than subtracting.

---

## Resource Inventory & Role Vocabulary (the 003<->004 interlock)

Activities in 003 declare needs via `ResourceRequirement{kind, role, id?}`. The scheduler matches on `(kind, role)`. **Therefore every role any 003 activity can request MUST exist here.** Roles are shared constants — `src/lib/roles.ts` — imported by both the activity fixtures (003) and this fixture's authoring/validation. No free-typed role strings.

### `roles.ts` (shared constant source of truth)

> **Decision (locked):** the **rich** role vocabulary from 002 is canonical (chosen over the lean set). The list below mirrors `src/lib/roles.ts` for convenience; 002 owns the file. 004 provides availability for **every** role in these unions (superset closure).

```ts
// Equipment roles
export const EQUIPMENT_ROLES = [
  'treadmill', 'rower', 'stationary-bike', 'squat-rack', 'dumbbells',
  'kettlebell', 'cable-machine', 'sauna', 'ice-bath', 'pool',
  'yoga-mat', 'foam-roller', 'bp-cuff', 'glucose-monitor', 'pulse-oximeter',
] as const;

// Specialist roles (medical doctors)
export const SPECIALIST_ROLES = [
  'physician', 'cardiologist', 'endocrinologist', 'sleep-physician',
  'dermatologist', 'psychiatrist', 'phlebotomist',
] as const;

// Allied-health roles / disciplines (role == discipline here)
export const ALLIED_HEALTH_ROLES = [
  'physiotherapist', 'occupational-therapist', 'dietitian', 'speech-therapist',
  'massage-therapist', 'personal-trainer', 'health-coach',
] as const;
```

**Naming reconciliation:** 003 and 004 originally diverged on two names — canonical forms are **`stationary-bike`** (not `spin-bike`) and **`squat-rack`** (not `strength-rig`). All resources below use the canonical names.

### Resources we will author

Equipment splits into two classes: **shared/facility gear** that can have real outages (treadmill, ice-bath, pool, etc.) and **always-available personal items** (mat, dumbbells, monitors) that we model with **no `blocked` ranges** — they exist so role-matching never strands an activity, but they never create conflicts. One resource per role (role-level pools allowed; add a 2nd later without touching 003).

| id | kind | role | label / name | default state | notes |
|----|------|------|--------------|---------------|-------|
| `eq-treadmill-01` | equipment | treadmill | Home Treadmill | available | **one maintenance gap (conflict #3)** |
| `eq-rower-01` | equipment | rower | Concept2 Rower | available | clean (treadmill backup) |
| `eq-stationary-bike-01` | equipment | stationary-bike | Stationary Bike | available | clean (treadmill backup) |
| `eq-squat-rack-01` | equipment | squat-rack | Squat Rack | available | clean |
| `eq-cable-machine-01` | equipment | cable-machine | Cable Machine | available | clean |
| `eq-dumbbells-01` | equipment | dumbbells | Dumbbell Set | available | personal — never blocked |
| `eq-kettlebell-01` | equipment | kettlebell | Kettlebell Set | available | personal — never blocked |
| `eq-yoga-mat-01` | equipment | yoga-mat | Yoga Mat | available | personal — never blocked |
| `eq-foam-roller-01` | equipment | foam-roller | Foam Roller | available | personal — never blocked |
| `eq-sauna-01` | equipment | sauna | Infrared Sauna | available | clean |
| `eq-ice-bath-01` | equipment | ice-bath | Ice Bath | available | **one short outage (conflict #4)** |
| `eq-pool-01` | equipment | pool | Lap Pool | available | clean (room for a closure conflict) |
| `eq-bp-cuff-01` | equipment | bp-cuff | Blood-Pressure Cuff | available | personal — never blocked |
| `eq-glucose-monitor-01` | equipment | glucose-monitor | CGM | available | personal — never blocked |
| `eq-pulse-oximeter-01` | equipment | pulse-oximeter | Pulse Oximeter | available | personal — never blocked |
| `sp-physician-01` | specialist | physician | Dr. Reyes | unbookable | broad windows |
| `sp-cardiologist-01` | specialist | cardiologist | Dr. Okafor | unbookable | **narrow** windows (conflict #5) |
| `sp-endocrinologist-01` | specialist | endocrinologist | Dr. Haddad | unbookable | a few windows |
| `sp-sleep-physician-01` | specialist | sleep-physician | Dr. Tan | unbookable | mid-window windows |
| `sp-dermatologist-01` | specialist | dermatologist | Dr. Alvarez | unbookable | a few windows |
| `sp-psychiatrist-01` | specialist | psychiatrist | Dr. Mwangi | unbookable | a few windows |
| `sp-phlebotomist-01` | specialist | phlebotomist | Jo Park | unbookable | windows for blood-draw / panels |
| `ah-physio-01` | alliedHealth | physiotherapist | Sam Cole | unbookable | broad, with a leave gap (conflict #6) |
| `ah-ot-01` | alliedHealth | occupational-therapist | Dana Fox | unbookable | broad windows |
| `ah-dietitian-01` | alliedHealth | dietitian | Priya Nair | unbookable | broad windows |
| `ah-speech-01` | alliedHealth | speech-therapist | Marco Ili | unbookable | limited windows |
| `ah-massage-01` | alliedHealth | massage-therapist | Lena Frost | unbookable | regular but limited |
| `ah-trainer-01` | alliedHealth | personal-trainer | Kai Brooks | unbookable | broad windows |
| `ah-coach-01` | alliedHealth | health-coach | Robin Vance | unbookable | broad windows |

Counts: **15 equipment, 7 specialists, 7 allied-health, 2 travel trips** — the rich set is the full superset of 003's required roles, so no required role is ever unprovided. Conflicts stay concentrated in a handful of resources (treadmill, ice-bath, cardiologist, physio, travel); everything else has broad open availability.

### Capacity / identity semantics

- **Role-level matching is the default.** A requirement `{kind:'equipment', role:'treadmill'}` matches *any* available treadmill resource. We allow **role-level pools**: if two resources share a role, the scheduler may use either (none needed yet, but the model permits it — e.g. a second strength rig could be added without touching 003).
- **`id` pins a specific resource.** A requirement `{kind:'specialist', role:'cardiologist', id:'sp-cardiologist-01'}` matches *only* that resource. Used when continuity of care matters (same doctor for follow-ups). For this fixture, most requirements are role-level; we reserve `id`-pinning for the cardiology follow-up to make the narrow-window conflict bite harder.

---

## Engineered Conflict Scenarios

All dates inside **2026-06-01 .. 2026-08-31**. Each conflict is positioned to overlap a **high-priority** 003 activity so the scheduler's adaptation is visible in output.

| # | Resource | Conflict ranges | Mechanism | Intended scheduler effect |
|---|----------|-----------------|-----------|---------------------------|
| 1 | `tr-001` (destination: Singapore) | blocked `2026-06-22 .. 2026-06-29` | member away → all member-presence activities unschedulable that week | High-priority on-site sessions (e.g. treadmill VO2 block, in-person physio) **skip** or use backup substitutions; remote-capable activities can run remotely. Demonstrates travel-driven skip/substitution. |
| 2 | `tr-002` (destination: Tokyo) | blocked `2026-08-10 .. 2026-08-14` | shorter trip late in window | Late-window recurring sessions skip those dates or use backups; proves the scheduler keeps adapting near the window end, not just early. |
| 3 | `eq-treadmill-01` | blocked `2026-07-06 .. 2026-07-12` (maintenance) | the *only* treadmill is down for a week | Treadmill-requiring runs during that week fall back to the **backup** (`eq-stationary-bike-01` / `eq-rower-01`) if the activity allows an equipment alternative, else **skip**. Demonstrates equipment-maintenance → backup-activity adaptation. |
| 4 | `eq-ice-bath-01` | blocked `2026-07-20 .. 2026-07-22` (outage) | short cold-therapy outage | Recovery activity on those days skips or uses a backup; small-scale conflict to show partial-window handling. |
| 5 | `sp-cardiologist-01` | available **only** `2026-07-01 .. 2026-07-03` and `2026-08-01 .. 2026-08-03` | cardiologist has two narrow clinic windows aligned with deterministic monthly target dates | A high-priority monthly cardiology consult can schedule only when its target date lands inside those windows; the June target should skip if no backup exists. Demonstrates narrow-availability success/failure without adding date re-flow. With `id:'sp-cardiologist-01'` pinning, no other cardiologist can absorb it. |
| 6 | `ah-physio-01` | available everywhere **except** a leave gap `2026-06-15 .. 2026-07-05` | physiotherapist on leave for ~3 weeks | Physio sessions in that gap skip or use a backup; overlaps `tr-001` to compound. Demonstrates allied-health unavailability mid-window. |

Open slots are guaranteed by construction: every resource has substantial available/clean time outside its conflict ranges, so most activities schedule normally and the conflicts stand out.

---

## Coverage & Counts

- **Window**: every resource's ranges live within and collectively touch both ends of `2026-06-01 .. 2026-08-31`. `AvailabilityBundle.windowStart/windowEnd` set to the canon constants.
- **Both states present**: open slots (clean equipment, broad specialist/physio windows) **and** the 6 conflicts above.
- **Spread**: conflicts land in June (travel-01, physio leave), July (treadmill maintenance, ice-bath, cardio window #1), and August (travel-02, cardio window #2) so no month is conflict-free and none is conflict-saturated.
- **Counts**: 15 equipment / 7 specialists / 7 allied-health / 2 travel trips. The 7 always-available personal equipment items and the broadly-available specialists/allied carry no conflicts — they exist purely to satisfy role-matching for the rich vocabulary.

---

## Storage & Loading

- **Path**: `src/data/availability.json` — a single object matching `AvailabilityBundle`.
- **Import**: direct ES import in the baseline app, e.g. `import availability from '@/data/availability.json'` (typed via the `AvailabilityBundle` guard in `src/lib/validate`). No fetch, no fs, no backend.
- **Validation**: the hand-rolled type guards from 002 run over the imported object in a Vitest unit test, asserting shape + window bounds + that every referenced role is in `roles.ts`.

---

## Tasks

1. Use the canonical `src/lib/roles.ts` vocabulary from 002. → verify: imported by both 003 fixtures and 004 validation; no other file hard-codes role strings.
2. Author `src/data/availability.json` as one `AvailabilityBundle` with `windowStart='2026-06-01'`, `windowEnd='2026-08-31'`.
3. Populate `equipment[]` (15 items) — all available by default, with `blocked` ranges only on `eq-treadmill-01` (#3) and `eq-ice-bath-01` (#4); the 7 personal items carry empty `blocked`. → verify: all roles ⊆ `EQUIPMENT_ROLES`.
4. Populate `specialists[]` (7 items) using `available[]` windows; give `sp-cardiologist-01` the two narrow windows (#5), others broad/moderate windows. → verify: all roles ⊆ `SPECIALIST_ROLES`.
5. Populate `alliedHealth[]` (7 items) using `available[]` windows; give `ah-physio-01` the leave gap (#6), others broad windows. → verify: all roles ⊆ `ALLIED_HEALTH_ROLES`.
6. Populate `travel[]` (2 trips) with `blocked` ranges (#1, #2). → verify: ranges inside the window.
7. Confirm every conflict in the table overlaps a high-priority 003 activity (cross-check once 003 is final). → verify: at least one skip and one substitution appear in the scheduler output.
8. Document the authoring method below (Generation Method).

### Generation Method (to be recorded)

**Decision (locked): LLM-authored static JSON, committed once.** The fixture is produced by a one-shot LLM prompt, then hand-verified against `roles.ts`, the window bounds, and the engineered-conflict table. Paste the prompt verbatim into `docs/prompts/004-availability.md` (per 007). No generator script, no automated/recurring generation at build or run time — the committed JSON is the deterministic source of truth.

---

## Open Questions / Decisions Needed

1. **Role superset closure — RESOLVED (rich set).** The **rich** vocabulary is canonical (15 equipment / 7 specialist / 7 allied), authored as `roles.ts` and fully provisioned here, so 004 is a guaranteed superset of 003. Remaining guard: a Vitest test must fail if any role string in `activities.json` has no matching `roles.ts` member or no `availability.json` provider. If 003 ever introduces a brand-new role, add it to `roles.ts` **and** a resource here in the same change.
2. **`id`-pinning vs role pool for cardiology.** Pinning makes conflict #5 sharper but couples 003 to a specific id. **Default**: pin only the cardiology follow-up (`id:'sp-cardiologist-01'`); leave everything else role-level so resources stay swappable.
3. **Travel = hard skip vs remote substitution.** Does the scheduler know an activity is "remote-capable"? That flag lives on the *activity* (003), not here. **Default**: 004 only encodes member-unavailable ranges; whether a blocked range causes a skip or a remote substitution is decided by 003's activity metadata + the scheduler. 004 stays purely about availability.
4. **Third travel trip.** **Default**: ship 2 trips; add a 3rd only if 003 needs more late-window pressure.

---

## Verification

- `availability.json` parses and passes the `AvailabilityBundle` type guard; `windowStart/windowEnd` equal the canon constants.
- Every `role` across equipment / specialists / alliedHealth is a member of the corresponding `roles.ts` constant (asserted in test).
- Every `DateRange` is well-formed (`start <= end`, both `YYYY-MM-DD`, inclusive) and lies within `2026-06-01 .. 2026-08-31`.
- All 4 record arrays are non-empty with the stated counts (15 / 7 / 7 / 2).
- Every role in `EQUIPMENT_ROLES` / `SPECIALIST_ROLES` / `ALLIED_HEALTH_ROLES` has at least one provider resource (rich-set superset closure).
- Each of the 6 engineered conflicts is present at the stated dates.
- Running `schedule(activities, availability)` against the final 003 activities yields a `ScheduleResult` that contains **at least one skip** (e.g. physio during leave, cardiology outside its narrow window, or run during travel) and **at least one substitution** (e.g. treadmill→stationary-bike) — proving adaptation.
- The fixture imports cleanly in both the app and Vitest with no runtime/network dependency.
