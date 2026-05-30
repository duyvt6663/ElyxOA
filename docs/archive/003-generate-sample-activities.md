# 003 - Generate Sample Activities

## Goal
Produce a realistic, prioritized action-plan dataset of **>=100 primary activities** that exercises every branch of the scheduler. The data must conform exactly to the canonical `Activity` type (file 002), use the shared role vocabulary that file 004 will satisfy, and load with zero manual cleanup. "Realistic" here means a longevity/health-optimization client's plan: daily meds and meals, weekly therapy and training, monthly check-ins, and a few annual events.

## Completion Notes (2026-05-30)
Completed and moved to archive.

- `src/data/activities.json` now contains 116 records: 102 primary activities plus
  14 backup-only fallback templates.
- Primary distribution matches the target exactly: fitness 28, food 24,
  medication 22, therapy 16, consultation 12.
- `act-003` Cardiology Review now says "Monthly review" and intentionally has no
  backup so the June cardiology skip remains visible.
- Most primary activities declare same-type no-resource fallbacks so resource,
  travel, and clinician conflicts visibly degrade into substitutions.
- Added fixture tests in `src/lib/scheduler.test.ts` for schema validity, counts,
  unique priorities, cadence coverage, backup integrity, role vocabulary, and
  canonical scheduling outcomes.
- Verified with `npm test`, `npm run build`, and a Playwright smoke load of `/`.

## Generation Strategy (rationale)
**Decision: (b) LLM-authored static JSON, committed once to `src/data/activities.json`.**

A seeded TS generator buys nothing here. The assignment's value is *realistic, hand-curated* health content (sensible titles, prep steps, backups, metrics) — exactly what a generator would have to hardcode anyway, just spread across loops and lookup tables. Per "Simplicity First", a generator is speculative machinery for a one-shot dataset. A static JSON file is:
- **Deterministic by construction** — bytes are fixed in git; no RNG, no seed to defend.
- **Inspectable** — reviewers read the data directly.
- **Already the artifact the scheduler imports** — no build step, no second source of truth.

**Determinism guard:** the JSON is the canonical source; nothing regenerates it at build time. If a future edit is needed, edit the JSON.

**Prompt documentation (assignment requirement):** the exact LLM prompt(s) used to author the JSON are captured verbatim in `docs/prompts/` (e.g. `docs/prompts/003-activities.md`), including the model used and the canonical-type spec pasted into the prompt. The data file carries no provenance fields (none exist on `Activity`); provenance lives only in `docs/prompts/`.

## Type & Frequency Distribution
Target **102 primary activities** (`isBackupOnly:false`) as a buffer over the 100 floor. Add a small number of `isBackupOnly:true` fallback templates only when a backup should not be scheduled as a standalone action-plan item. Counts chosen so daily-cadence types (food, medication) dominate volume while consultations/therapy create the scheduling pressure against constrained specialists/allied health.

| ActivityType   | Count | Typical frequencies (count/period)                                  | Notes |
|----------------|-------|---------------------------------------------------------------------|-------|
| `fitness`      | 28    | 3/week (strength, zone-2), daily (walk/mobility), 1/week (long session) | Heavy equipment + remote split |
| `food`         | 24    | daily (most), 1/week (meal prep), 1/month (pantry reset)            | Mostly remote/home |
| `medication`   | 22    | daily (most), 1/week, 1/month (injectable), 1/year                  | Remote; some require pharmacy/specialist sign-off |
| `therapy`      | 16    | 1/week (PT, massage), 2/week (mobility), 1/month                    | Allied-health-bound |
| `consultation` | 12    | 1/month, 1/year (annual blood panel, annual physical)              | Specialist-bound; rare slots |
| **Total**      | **102** |                                                                   |       |

This guarantees all five types are represented and spans **daily, weekly, monthly, and yearly** cadences. At least one yearly item (annual blood panel) exists to test long-period scheduling.

## Priority Scheme
**Decision: unique integers `1..N` across all records (1 = highest), no ties.**

Rationale: the scheduler is a *pure deterministic* function (001). Ties would force a secondary tiebreaker (e.g. id order) and make the resolution implicit. Unique priorities make the intended ordering explicit and total, so conflict resolution is unambiguous and trivially testable.

Priority assignment heuristic (highest -> lowest):
1. **Safety-critical medication** (daily essential meds).
2. **Monitoring consultations** that gate other care (e.g. labs the physician reads).
3. **Core fitness + therapy** (rehab, strength).
4. **Food/nutrition** habits.
5. **Optimization/optional** items (sauna, massage cadence beyond minimum).

The dataset ships pre-sorted by priority ascending for readability; the scheduler must not rely on array order, only on the `priority` field. Primary activities should occupy the first 102 priority values; any `isBackupOnly:true` fallback templates continue after that range and are ignored for primary expansion.

## Backup Linkage Rules
`backupActivityIds` is a **preference-ordered list of real `act-NNN` ids** that are valid substitutes when the primary cannot be scheduled (resource/travel/availability conflict). Backup records that should only appear as substitutions must set `isBackupOnly:true`; the scheduler will not expand them as primary occurrences.

Linkage rules:
- **Same `type`** as the primary (a fitness backup is another fitness activity).
- **Lower or equal resource demand** — a backup should relax a constraint, not tighten it. Preferred pattern: primary needs constrained equipment/specialist; backup is `canBeRemote` or needs nothing (e.g. "barbell squats" -> "bodyweight squats"; "in-clinic PT" -> "home mobility routine").
- **Similar intent/metric overlap** — backup should advance at least one of the primary's `metrics`.
- **No cycles that strand the scheduler**: backups may chain, but every chain must terminate at an activity with no unmet resource needs (typically a remote-capable/no-resource fallback).
- **All ids must resolve** — every id in `backupActivityIds` exists in the dataset. Validation (002 type guards) plus a test enforce referential integrity.

At least ~40% of constrained activities should declare a usable backup so the scheduler visibly degrades gracefully rather than dropping work.

## Resource-Role Vocabulary (003<->004 interlock)
Activities declare needs as `ResourceRequirement{kind, role, id?}`, matched by `(kind, role)`. **004 must supply availability for the union of every role used here.** To prevent drift, both files import from **one shared constant module: `src/lib/roles.ts`** (exported `as const` string-literal unions). 003 references these constants when authoring (conceptually — JSON stores the literal strings, which must equal the constants), and a test asserts every role string in `activities.json` is a member of the `roles.ts` union.

Canonical vocabulary from 002 (roles this file may use):

**equipment** (`kind:'equipment'`):
`treadmill`, `rower`, `stationary-bike`, `squat-rack`, `dumbbells`, `kettlebell`, `cable-machine`, `sauna`, `ice-bath`, `pool`, `yoga-mat`, `foam-roller`, `bp-cuff`, `glucose-monitor`, `pulse-oximeter`

**specialist** (`kind:'specialist'`, MD/clinician roles):
`physician`, `cardiologist`, `endocrinologist`, `sleep-physician`, `dermatologist`, `psychiatrist`, `phlebotomist`

**alliedHealth** (`kind:'alliedHealth'`):
`physiotherapist`, `occupational-therapist`, `dietitian`, `speech-therapist`, `massage-therapist`, `personal-trainer`, `health-coach`

Notes:
- Common/home equipment (`yoga-mat`, `foam-roller`) can be modeled as *always available* in 004 so they don't block; constrained equipment (`sauna`, `ice-bath`, `pool`, `squat-rack`) is what drives adaptation.
- `id?` is used sparingly to pin a specific resource (e.g. a named cardiologist) for a continuity-of-care consultation; most requirements stay role-only.
- The **scarcity knob**: ensure several high-priority activities depend on `cardiologist`, `sleep-physician`, `pool`, or `sauna` so 004's narrow `available`/`blocked` windows force the scheduler to skip or fall back to backups.

## Realism Guidelines per type
- **fitness** — titles like "Zone-2 cardio (treadmill)", "Lower-body strength". `prep`: ["change clothes","hydrate"]. `metrics`: ["avg HR","session RPE","total volume"]. `facilitatorLabel`: "Self" or "personal-trainer". Mix of in-gym (equipment-bound) and remote bodyweight.
- **food** — "High-protein breakfast", "Weekly meal prep". Mostly `canBeRemote:true`, `locations:["Home"]`. `metrics`: ["protein g","fiber g","adherence"]. `prep`: ["grocery order"] for prep sessions. Backups: dining-out-friendly variants.
- **medication** — "Morning statin", "Weekly B12 injection". `canBeRemote:true`, `locations:["Home"]`. `metrics`: ["adherence %"]. Some injectables/refills carry a `physician`/`endocrinologist` requirement on a monthly/yearly cadence; `skipAdjustment`: "take as soon as remembered same day, else skip".
- **therapy** — "Physiotherapy session", "Deep-tissue massage". Allied-health-bound (`physiotherapist`, `massage-therapist`). `canBeRemote` mostly false (in-clinic); home-mobility backups remote. `metrics`: ["pain score","ROM"].
- **consultation** — "Monthly cardiology review", "Annual blood panel", "Sleep study". Specialist-bound, rare. `canBeRemote`: telehealth-eligible ones true (e.g. follow-up review), procedural ones false (blood draw needs `phlebotomist` on-site). `prep`: ["fast 12h","bring meds list"]. `metrics`: ["lipid panel","HbA1c","AHI"].

**Remote / location population:** `canBeRemote:true` for home meds, most food, telehealth follow-ups, and bodyweight fitness. `locations` lists realistic named places drawn from a small fixed set (e.g. `"Home"`, `"Elyx Gym"`, `"Downtown Clinic"`, `"Sleep Lab"`, `"Hotel Gym"`) so they intersect meaningfully with 004's travel destinations.

## Storage & Loading
- **Path:** `src/data/activities.json` (canonical, single file).
- **Loading:** imported via direct ES import in the baseline scheduler loader (`import activities from '@/data/activities.json'` or relative), NOT `fetch`, NOT `/public` (per 001). `tsconfig` `resolveJsonModule` enabled; the import is cast/validated through the 002 hand-rolled type guards before use.
- Primary IDs are `act-001` .. `act-102`, zero-padded to 3 digits, contiguous and unique. Backup-only template IDs may continue the same sequence after the primary range. Aligning id order with priority order is **not required** (priority is the ordering field).

## Tasks
1. Use the canonical `src/lib/roles.ts` vocabulary from 002; do not define role strings locally.
2. Author `src/data/activities.json` with 102 primary activities matching the distribution table; every object includes ALL canonical `Activity` fields (002) — no extra fields.
3. Assign unique `priority` values across all activity records per the heuristic; primary activities use the first 102 priorities and backup-only templates continue after them.
4. Populate `resources` so multiple high-priority items depend on scarce roles (`cardiologist`, `sleep-physician`, `pool`, `sauna`, `phlebotomist`).
5. Wire `backupActivityIds` per the linkage rules; use `isBackupOnly:true` for fallback templates that should not be independently scheduled, and ensure every chain terminates in a no-unmet-resource fallback.
6. Fill realistic `facilitatorLabel`, `locations`, `canBeRemote`, `prep`, `skipAdjustment`, `metrics` per the realism guidelines.
7. Capture the authoring prompt(s) + model in `docs/prompts/003-activities.md`.
8. Add tests (Vitest): count >=100, all five types present, unique priorities, all `backupActivityIds` resolve, all role strings are members of `roles.ts` unions, data passes 002 type guards.

## Open Questions / Decisions Needed
1. **Role-vocabulary ownership / reconciliation — RESOLVED (rich set).** `src/lib/roles.ts` is the single source of truth with the **rich** vocabulary above (15 equipment / 7 specialist / 7 allied). 004 provisions a provider for **every** role, so it is a guaranteed superset. Canonical names are `stationary-bike` and `squat-rack` (004 was realigned off its earlier `spin-bike`/`strength-rig`). Guards: a test asserts `activities.json` roles ⊆ `roles.ts`, and a second test (owned by 004) asserts every required role has ≥1 provider.
2. **Activity count: 100 vs 102.** *Recommended default:* **102 primary activities** (buffer absorbs any item dropped in review without breaching the floor). Backup-only templates do not count toward the 100 floor.
3. **Pinned-resource `id` usage.** How many activities pin a specific resource via `id?` vs role-only matching. *Recommended default:* pin only ~2-3 continuity-of-care consultations; everything else role-only (keeps 004's data simpler and matching mostly by `(kind, role)`).
4. **Always-available commodity equipment.** Whether `yoga-mat`/`foam-roller` etc. appear in 004 at all. *Recommended default:* include them in 004 as unconstrained (never blocked) so the role check passes without creating false scheduling pressure.

## Verification
- **Count:** `activities.filter(a => !a.isBackupOnly).length >= 100` (target 102 primary). Automated.
- **Schema:** every activity passes the 002 type guards; no missing/extra fields. Automated.
- **Type coverage:** all five `ActivityType` values present; counts roughly match the distribution table. Automated.
- **Priority integrity:** priorities are unique integers `1..N`, no gaps, no ties; primary activities occupy the first 102 values. Automated.
- **Frequency spread:** at least one each of daily, weekly, monthly, and yearly cadence present. Automated.
- **Backup integrity:** every `backupActivityIds` entry resolves to an existing id; backup-only templates are not primary-expanded; no chain fails to terminate at a no-unmet-resource activity. Automated.
- **Role consistency:** every role string used is a member of the `src/lib/roles.ts` unions (003<->004 interlock guard). Automated.
- **Scarcity present:** at least a handful of high-priority activities depend on constrained roles, so the scheduler demonstrably adapts. Spot-checked + asserted by a test counting constrained high-priority items.
- **Loadability:** `src/data/activities.json` imports cleanly at build time with no manual edits. Verified by a green build.
