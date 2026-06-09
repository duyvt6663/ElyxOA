# 024 - Daily load realism (consultation & fitness same-day limits)

## Source

A schedule-review observation on June 2nd, 2026 (driving the live app, 2026-06-09): the **09:00–12:00
"Morning work block"** is overlapped by **three consultations**, and the same day carries **two
high-intensity workouts back-to-back late at night**. Reviewer question: *how many consultations /
workouts per day is realistic — is 2 too much?* This doc captures the diagnosis and a proposed,
philosophy-preserving fix before any code is written.

Severity: **P2** — does not break the demo, but produces an unrealistic, over-subscribed day that a
clinical reviewer will (rightly) flag.

> **Status (2026-06-09):** **A + C implemented & verified.** Phase A (category-aware same-day load —
> consultations escalate, quick habits weightless) + Phase C (default high↔high same-day rule) shipped
> in `temporal-scheduler.ts` + `temporal-policy.ts`. **Phase B (monthly/yearly due-date stagger)
> deferred** — it would move the Cardiology Review off June 1 and break acceptance A1. The
> moderate-fitness cap is intentionally **out of scope** (data-quality issue — see Result). Locked
> decisions: consultation target **1/day**; high↔high **same-day only**.

---

## Implementation result (A + C — 2026-06-09)

**Shipped:**
- **A — category-aware same-day load** (`temporal-scheduler.ts`): replaced the flat
  `committed.length * 3` overload with `FOCUSED_OVERLOAD_PER` (3 per prior **blocking** action — so
  quick habits are weightless) + `CONSULT_SAME_DAY_COST = [0, 40, 200]` (escalating per same-day
  consultation; 40 > a monthly activity's ±6-day move = 36). Stays **soft** — never changes
  feasibility, so it cannot raise the skip rate.
- **C — high↔high same-day rule** (`temporal-policy.ts`): the high-intensity default gains
  `avoidAfter { activityType:'fitness', intensity:'high', withinMinutes: 24h }`. The rule check is
  intra-day, so this is a same-day ban; it's symmetric, so it also separates the one explicit-policy
  high (`VO2 Max Primer`).

**Verified:** `tsc` clean · **vitest 95/95** (3 new: consultation-slides, no-two-high-same-day,
soft-cost-never-skips) · deterministic (full fixture, run-twice identical) · `npm run build` static
green · **cardiology June-1 skip preserved** (`occ-act-003-2026-06-01` unchanged → A1 intact).

**Outcome on the full plan (before → after):**

| metric | before | after |
|---|---|---|
| scheduled / substituted / skipped | 3318 / 190 / 6 | 3277 / 232 / 5 |
| skip rate | 0.171% | **0.142%** |
| days with ≥2 high-intensity | ~20 | **0** |
| June 2 consultations | 4 | **2** |
| max consultations/day (early June) | 3–4 | **2** |

**Two honest findings:**
1. **Consultations reached 2/day, not the locked 1/day.** A alone can't go further — ~10 monthly
   consultations are all due June 1 and can only slide within ±6 days (saturated). The last step to
   1/day is exactly **Phase B** (spread the due-dates), which is deferred. A did remove every 3+/day pile.
2. **Moderate-fitness cap dropped (deliberate).** The fixture carries **4–6 "moderate fitness"/day
   uniformly**, much of it fitness-*admin* mis-typed as moderate (Wearable Readiness Sync, Technique
   Video Review, Training Adherence Report). With no title parsing allowed in the scheduler and the load
   uniformly saturated, a moderate cap would churn the schedule with nowhere emptier to move. This needs
   a **data-quality pass** (retype admin tasks), not a scheduler cap — track separately.

**Ripple to refresh after merge/deploy:** the scheduled/substituted split (3318/190/6 → 3277/232/5,
skip 0.17→0.14%) and the June-2 example (no longer 3-consult / 2-high) make the deck + `qa-prep.md`
figures stale. **Robustness note:** if more explicit-policy high-intensity activities are added, give
them the same `avoidAfter` high↔high rule in the fixture.

## Problem

Running the real scheduler (`scheduleTemporal` with the committed `activities` + `availability` +
validated `scheduling-hints`) for **2026-06-02** produces:

```
Consultations (3, all overlapping the 09:00–12:00 work block — by design, see below):
  09:00–09:30  Annual Blood Panel Draw
  09:30–10:30  Sleep Physician Review
  10:30–11:30  Psychiatry Medication Review

Focused workouts (3):
  18:00–19:00  Lower Body Strength        (moderate)
  21:30–22:00  Kettlebell Power Circuit   (HIGH)
  22:00–22:30  Plyometric Primer          (HIGH)   ← right before 22:30 sleep
+ ~12 "quick" habits (meds, BP log, mobility, walk, step count)
```

Two things read as unrealistic:
1. **Three expert appointments stacked into one work morning.** (The work *overlap* itself is correct
   — the consultation-overlaps-work exception at `temporal-scheduler.ts:386` is intentional; the
   problem is the **count/clustering**, not the overlap.)
2. **Two high-intensity sessions back-to-back at 21:30–22:30**, immediately before bedtime — both a
   recovery problem and a sleep-hygiene problem.

The current model has **no per-day limit** on either category — only a weak, uniform soft penalty.

## Root cause (all in the scheduler, all fixable)

1. **The same-day overload penalty is weak and category-blind.** `sameDayOverloadPer = 3`
   (`temporal-scheduler.ts:86`, applied `:444`) is added **per committed action that day, counted
   uniformly** — every pill, walk, and workout weighs the same 3 points. So it cannot distinguish
   "many harmless habits" from "too many demanding sessions," and at 3 points it is too weak to
   consistently beat the movement/off-window tradeoffs that would spread load to another feasible day.

2. **Monthly/annual activities are not staggered.** The weekday stagger applies to *weekly* activities
   only (`:703` — `period === 'week' ? staggerOffset(id) : 0`). Every monthly consultation's first
   occurrence falls in early June, and the ±6 movement window (`MOVE_RADIUS`, `:276`) can only shuffle
   within ~a week — so the annual Blood Panel plus monthly Sleep Physician and Psychiatry reviews all
   pile onto June 1–2 instead of spreading across the early plan window/month.

3. **Nothing spaces high-intensity sessions.** Two different high-intensity weeklies can hash to the
   same day (the stagger spreads by id, not by intensity collision), and no temporal rule keeps them
   apart — so Kettlebell + Plyometric land together, and the `lateEveningStimulating` penalty (15) was
   not enough to push the second elsewhere on a contended day.

## Design stance

**Keep "overload is a soft cost, not a wall."** A hard daily cap would reintroduce *silent drops*,
which the whole design avoids ("adaptation, not failure"). The V1 fix is to make the **soft costs
smarter** so the scheduler **spreads** across the existing movement window instead of cramming.

## What is realistic (the target behavior)

- **Consultations:** ≤ **1/day by default** for auto-scheduling. A 2nd same-day consultation is allowed
  only as a *deliberate* "batched health day" (member opt-in), never auto-stacked. 3 is never an
  auto-scheduler outcome.
- **Fitness — gated by intensity, not count:**
  - **High-intensity:** ≤ **1/day**, with a recovery gap to the next high-intensity session.
  - **Moderate (focused):** ≤ **1–2/day**.
  - **Low-intensity habits** (mobility, walk, stretch, step count): **unlimited** — these are meant to
    be sprinkled through the day.

## Proposed changes

### A. Category/intensity-aware same-day overload (soft)
Replace the flat `sameDayOverloadPer * committed.length` with a penalty that **only escalates for
demanding actions**:
- Classify load from scheduler-native fields: candidate `activity.type` plus resolved
  `policy.intensity`; do **not** add title parsing in the scheduler.
- Count, per day, prior **consultations**, **high-intensity fitness**, and **moderate focused fitness**
  separately. Ignore low-intensity/quick habits for this term.
- Apply an **escalating** cost by bucket:
  - consultation: cheap for the 1st, steep for the 2nd, effectively prohibitive for the 3rd;
  - high fitness: cheap for the 1st, steep for the 2nd;
  - moderate fitness: cheap for the 1st, mild for the 2nd, steep for the 3rd.
- Penalties after the default target must dominate `movedPerDay` (6) so the scheduler slides an extra
  demanding action to another day in the movement window when such a day exists.
- Do not keep the current full-strength uniform term on top of the new buckets. Either drop it or
  reduce it to a tiny tie-breaker so habit-dense days are not falsely penalized.

### B. High↔high recovery rule
Add to the default policy for high-intensity fitness (`temporal-policy.ts:67`) an
`avoidAfter: { activityType: 'fitness', intensity: 'high', withinMinutes: <gap> }` rule. The temporal
engine already enforces symmetric proximity bans (`temporalRuleViolation`, `:259`), so this would
separate two high-intensity sessions on the **same day** without new machinery.

Recommended V1 scope: same-day only, using a large intra-day gap (e.g. 12–16h or 24h; any value above
the waking horizon effectively means "no second high-intensity session today"). A true overnight
recovery gap is a separate scheduler change because the current temporal rule check only compares
against actions already committed on the candidate day.

### Deferred: monthly / yearly due-date staggering
Do **not** implement generalized monthly/yearly staggering in this backlog.

Reason: it conflicts with the locked cardiology demo. `act-003` Cardiology Review is a `month/1`
consultation, and acceptance A1 intentionally asserts the June 1 skipped occurrence
`occ-act-003-2026-06-01` plus the `specialist`/`cardiologist` failure trace. Hash-staggering all
`month/1` consultations would move Cardiology off June 1, change the occurrence id, and violate the
regression rule below that the cardiology-skip demo remains unchanged.

If this is revisited later, it needs an explicit anchoring/opt-out design or an intentional acceptance
rebaseline first; it should not be introduced as a blind hash over all monthly/yearly activities.

## Decisions to lock (before coding)

1. **Consultation default target:** 1/day (recommended) vs 2/day. And: is "batched health day" in
   scope for V1, or just the default auto-scheduling target?
2. **Fitness targets:** confirm 1 high / 1–2 moderate / unlimited low.
3. **High↔high recovery gap:** recommended V1 is same-day only. A real overnight gap (e.g. 24–36h)
   means the rule must compare across days, not just within a day (current `temporalRuleViolation` is
   intra-day) — that's a bigger change.
4. **Penalty magnitudes** for the escalating overload (must beat `movedPerDay=6` but not silently
   force skips when the whole window is contended).
5. **Skip-rate guardrail:** any spreading must NOT push the skip rate above its current **0.17%**
   (6/3514). Spreading should use the movement window, not drop actions.
6. **Monthly/yearly staggering:** explicitly deferred unless the cardiology acceptance demo is
   re-anchored or rebaselined.

## Implementation phases

1. **A (category-aware overload)** — add the escalating same-day term; tune magnitudes against the
   fixture. → verify: ≤1 consultation/day by default, ≤1 high-intensity workout/day, and moderate
   double-days remain possible when otherwise feasible; skip rate ≤ 0.17%; cardiology A1 unchanged.
2. **B (high↔high spacing)** — add the default same-day rule for high-intensity fitness. → verify: no
   two high-intensity sessions share a day (e.g. Kettlebell & Plyometric separate).

Each phase is independent and individually shippable; the overload scoring and high-intensity rule
compose.

## Testing & acceptance

- **Unit (`temporal-scheduler.test.ts`, plus `temporal-policy.test.ts` if the default-policy helper is
  tested directly):** new cases — (a) a day offered ≥2 consultations places one and slides the rest
  when another feasible day exists; (b) two high-intensity activities due the same day land on different
  days; (c) low-intensity daily habits do not trigger the demanding-load penalty.
- **Regression:** determinism preserved (run twice, byte-identical); skip rate ≤ 0.17%; the existing
  cardiology-skip + travel demos unchanged.
- **Acceptance (drive-acceptance.mjs):** a new case asserting June 2 (or the worst-case day) shows
  ≤ 1 consultation and ≤ 1 high-intensity workout; moderate + high is allowed only if it remains
  inside sensible windows and not back-to-back.
- **Suite:** `npm test` green with the added cases; `tsc` clean; static build green.

## Out of scope

- Hard daily caps with silent drops (rejected — breaks "adaptation, not failure").
- Generalized monthly/yearly due-date staggering in V1 (deferred — conflicts with A1 / cardiology
  regression unless an explicit anchor or acceptance rebaseline is designed first).
- Multi-member / cross-member resource contention.
- A member-configurable "batched health day" UI (could be a follow-up if §Decisions 1 wants batching).

## Adjacent issue noted (separate from this spec)

While inspecting June 2, an **"Evening Downshift Routine"** (a wind-down therapy, default preferred
window 20:30–22:00 via `temporal-policy.ts:89`) placed at **07:30**, far outside its evening window.
This is unrelated to daily load (it's a placement/scoring oddity) and should be triaged separately —
likely a policy-resolution or window-scoring quirk worth its own trace.
