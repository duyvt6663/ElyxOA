# 025 - Schedule realism gaps (post-024 verification findings)

## Source

Deployed-app verification on 2026-06-09, right after 024 shipped (commit `0dcb583`, live at
`https://elyx-oa.vercel.app/`). Confirmed the deploy (summary pills **3277 / 232 / 5**, 0 console
errors) and ran a full gap scan across the deterministic schedule. 024 was a clear **net
improvement**, but the scan surfaced residual realism gaps — most of them **pre-existing
data-quality issues**, none introduced by 024.

Severity: **P1** = visibly wrong to a reviewer; **P2** = noticeable; **P3** = minor / edge.

> **Status (2026-06-09):** **G1 + G2 implemented & verified** (data-quality fixes in
> `src/data/activities.json` + a fixture-realism acceptance test). **G3 + G4 experimented — not
> scoring-solvable** (structural over-subscription; soft late-evening penalty moves nothing, even at
> 5×). Real fix is data-level or accept. Not yet deployed — see Implementation result.

---

## Context — 024 was a net improvement (not a regression)

Same gap scan run against the pre-024 build (`82f602a`) vs. the deployed build:

| gap | pre-024 | deployed (post-024) |
|---|---|---|
| high-intensity ≥ 20:00 | 56 | **10** |
| focused workout ≥ 21:00 | 80 | **36** |
| wind-down therapy before 15:00 | 36 | **11** |
| placed outside preferred window | 243 (6.9%) | **150 (4.3%)** |
| food "breakfast" placed ≥ 11:00 | 17 | 17 (unchanged) |

024 cut the late-workout, wind-down-misplacement, and off-window counts by half to two-thirds. The
gaps below are what *remains*.

---

## Implementation result (G1 + G2 — 2026-06-09)

**G1 (breakfast).** `act-013 Protein-Forward Breakfast` `durationMinutes` 20 → **15** — now a quick,
non-blocking habit. It places **06:00–08:30 across all 92 days**; the night/evening placements are
gone (verified it stays in the morning, not all-day-flexible).

**G2 (fitness admin).** Added an explicit `temporalPolicy { intensity: "low", preferredWindows:
[midday 08:00–20:00] }` to the 5 admin/readiness fitness activities (Pulse Oximeter Readiness Check,
Wearable Readiness Sync, Deload Readiness Check, Monthly Training Adherence Report, Technique Video
Review) — activity `type`/resources unchanged, so UI/education copy is untouched. They no longer count
as moderate training load.

**Acceptance guard.** New `src/lib/fixture-realism.test.ts` runs the real fixture through
`scheduleTemporal` and asserts G1 (no "breakfast" food ≥ 11:00) + G2 (those tasks resolve to low) —
CI-enforced via `npm test`.

**Verified.** `tsc` clean · **vitest 97/97** (+2) · deterministic (run-twice identical) ·
`npm run build` static green · cardiology June-1 skip preserved (A1).

| metric | 024-only | + G1/G2 |
|---|---|---|
| scheduled / substituted / skipped | 3277 / 232 / 5 | **3311 / 200 / 3** |
| skip rate | 0.142% | **0.085%** |
| food "breakfast" ≥ 11:00 | 17 | **0** |
| late workouts ≥21:00 / wind-down AM (G3/G4) | 36 / 11 | 36 / 11 (deferred — unchanged) |

Freeing the exclusive slots breakfast/admin used to hog let more primaries schedule (fewer
substitutions + skips). **G3/G4 unchanged → no regression.** Not yet deployed; the deck/qa-prep
figures (3277/232/5) need a refresh to 3311/200/3 on deploy.

---

## G1 [P1] "Breakfast" scheduled at night

**Observed.** `Protein-Forward Breakfast` (`act-013`) is **scheduled** (not substituted) at **22:00**
on Jun 1, **21:00** on Jun 2, and **16:30** for a long run Jun 22–Jul+ — 17 occurrences placed
≥ 11:00. A "breakfast" at 10 p.m. is the single most reviewer-visible gap.

**Root cause.** It's modeled as a **daily, 20-min, *blocking* food** with a morning-only window:
- `type: food`, `durationMinutes: 20`, `frequency: { period: day }`, no explicit `temporalPolicy`.
- 20 min ≥ the blocking threshold (`isBlocking` in `temporal-scheduler.ts`), so it needs an
  **exclusive** focused slot.
- The default food policy for a "breakfast" title is **MORNING 07:00–09:00**
  (`getDefaultTemporalPolicy` in `temporal-policy.ts`).
- On contended mornings (work block, commute, breakfast meal block, other focused actions) there is
  no free exclusive slot in 07:00–09:00, so it pays the off-window penalty (18) and lands wherever an
  exclusive slot *is* free — the evening. Being **daily** (movement radius 0) it can't shift to a
  calmer day.

**Proposed fix (data-quality, no scheduler change).** Eating breakfast is not a focused exclusive
session. Make it a **"quick" habit** — set `durationMinutes < 20` (e.g. 10) so `isBlocking` is false,
letting it coincide with the morning routine and stay near breakfast time. (Alternatively widen its
window, but quick-habit is the right model.) Verify the occurrence remains in the morning; the point is
not to make breakfast all-day-flexible.

## G2 [P3] Fitness *admin* mis-typed as moderate-intensity fitness

**Observed.** Several activities are `type: fitness` with no explicit policy, so they default to
`intensity: moderate` — yet they're admin/monitoring, not training:

| title | duration | cadence |
|---|---|---|
| Pulse Oximeter Readiness Check | 3 min | week |
| Wearable Readiness Sync | 10 min | week |
| Deload Readiness Check | 10 min | week |
| Monthly Training Adherence Report | 15 min | month |
| Technique Video Review | 25 min | month |

These inflate the "moderate fitness" load to **4–6/day** uniformly across the plan.

**Root cause.** `getDefaultTemporalPolicy` assigns fitness `moderate` when no high/low keyword
matches in the fitness default branch; these titles match none, so a 3-minute oximeter check counts as
a "moderate workout."

**Why it matters.** This is exactly why **024 had to scope out the moderate-fitness cap** (see
`024` Result §2) — capping a metric polluted by admin tasks would churn the schedule for no benefit.
Retyping these unblocks a future moderate-load cap.

**Proposed fix (data-quality).** Prefer keeping their current activity `type`/resource semantics and
adding explicit low/no-load `temporalPolicy` overrides (`intensity: low`, appropriate windows) so they
do not count as moderate training load. Retyping to a different activity type is broader and should
only be done if the downstream UI/education copy is updated intentionally.

## G3 [P3] Residual late workouts

**Observed.** 36 focused (incl. 10 high-intensity) sessions still land ≥ 21:00 — e.g. `Row Erg
Intervals` 21:30, `Lower Body Strength` 21:00. Down ~⅔ from baseline, but not gone.

**Root cause.** On contended days the only free exclusive slot is late evening, and weekly ±3
movement (`MOVE_RADIUS`) can't always reach an earlier-day morning slot. The `lateEveningStimulating`
penalty (15) loses when every earlier candidate is infeasible.

**Proposed fix.** Do **not** blindly un-defer 024 Phase B here: generalized monthly/yearly due-date
staggering conflicts with the locked June 1 Cardiology Review acceptance demo unless an explicit
anchor/opt-out or acceptance rebaseline is designed first. For this backlog, treat G3 as a residual
contention follow-up after G1/G2: rerun the scan, then consider a soft "no focused non-low fitness
after ~20:30" penalty or a stronger late-evening fitness penalty. Keep it soft (no silent drops) and
verify A1/cardiology remains unchanged.

**Experiment (2026-06-09) — a soft penalty does NOT solve this.** Added the suggested moderate
late-evening penalty (tested at 12 *and* 60): **zero movement** — still 36, identical day-of-week
distribution. The penalty applies uniformly to every late candidate, so it can only help if a non-late
in-window slot exists to move into — and there isn't one. Capacity scan: **2.6 focused workouts/day**
(243 over 92 days); weekday in-window slots (bounded by the 09:00–17:00 work block) *and* weekends are
already saturated. This is **structural over-subscription**, not a scoring problem — a soft penalty
can't manufacture capacity. **The real lever is data-level** — fewer / shorter / merged focused
activities — or accepting that an over-subscribed member trains some evenings (36/3514 ≈ 1%).
A1/cardiology was unchanged in every variant; the experiment was reverted (no scheduler code kept).

## G4 [P3] Wind-down therapy in the morning

**Observed.** 11 occurrences of wind-down therapy before 15:00 — e.g. `Sauna-Only Downshift` at
**06:30**. Its default policy *is* bedtime (`getDefaultTemporalPolicy` maps downshift/sleep/sauna
therapy to BEDTIME 20:30–22:00, anchor bedtime), so this is a contention-driven off-window placement,
not a policy bug.

**Root cause.** Same family as G3: it's tier-5 (low-intensity → placed last); by the time it's
allocated, its 20:30–22:00 window is taken, so the cheapest feasible exclusive slot is an empty early
morning. Reduced by 024 (36 → 11) but present.

**Proposed fix.** Same caution as G3: do not use blind monthly/yearly staggering as the V1 answer.
After G1/G2, consider a steeper off-window penalty for `anchor: bedtime` therapy. Allowing wind-downs
to be "quick" is only appropriate for non-resource, genuinely ambient routines; equipment-bound
sessions like sauna still need exclusive/resource-aware placement.

**Experiment (2026-06-09).** Same root cause as G3, confirmed structural. Pushing fitness out of late
evenings did **not** free an evening slot for the sauna downshift (the fitness didn't move; evenings
stay full). `Sauna-Only Downshift` needs an *exclusive* evening slot (1 sauna instance, `eq-sauna-01`)
and the member's evenings are over-subscribed, so no soft scoring change lands it in the evening. Same
data-level fix as G3, or accept the morning sauna.

---

## Proposed approach

- **G1, G2 are pure data-quality** (retype/retime mis-modeled fixtures in `src/data/activities.json`)
  — low risk, high reviewer-visible payoff. Do these first.
- **G3, G4 are structural over-subscription** — confirmed by experiment (2026-06-09): a soft
  late-evening penalty (even at 5× strength) moves nothing because no in-window slots exist, and Phase B
  is out (A1). They are **not scoring-solvable**. The real lever is **data-level** (fewer / shorter /
  merged focused activities) or accepting some evening workouts/morning sauna as realistic for a
  2.6-focused-workout/day plan.

## Testing & acceptance

- Make the gap scan repeatable (commit a small script or encode equivalent fixture-level assertions)
  before relying on its numbers. Acceptance targets: food "breakfast" never ≥ 11:00; admin/readiness
  tasks no longer count as moderate training load; late workouts/wind-down misplacements do not
  regress.
- **Guardrails:** skip rate ≤ 0.14% (current); determinism (run-twice identical); `npm run build`
  green; existing demos preserved (cardiology June-1 skip / A1, travel weeks).
- Unit tests for any new policy/penalty; `npm test` green.

## Out of scope

- Regenerating the whole 116-activity fixture.
- Blind monthly/yearly due-date staggering; it remains deferred unless the Cardiology Review anchor /
  A1 acceptance contract is explicitly redesigned.
- New scheduler dimensions; this is data hygiene plus, at most, narrow soft-scoring adjustments.
