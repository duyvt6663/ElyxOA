# 016 - Temporal UI/UX Verification (post-015)

## Goal
Record a full feature-by-feature UI/UX verification of the **temporal** app (015) driven via
Playwright across desktop (1280×900) and mobile (360×800), and the gaps it surfaced. This is
the 015-era analogue of 014 (which verified the pre-temporal 011/012/013 build). Screenshots
under `/tmp/elyx-ux2/`.

The temporal scheduler exposed density/identity issues that did not exist at the date-only
scale. The two **severe** ones were fixed in the same pass; the rest are tracked below.

## Severe — found and FIXED this pass

1. **Duplicate occurrence ids → 122 console errors + broken trace lockstep.**
   The occurrence id was `occ-<activityId>-<placedDay>`. With movement windows (weekly/monthly
   actions can shift ±3/±6 days) two due-dates of the same activity could resolve to the **same
   placed day**, producing two occurrences with the same id → React "duplicate key" warnings in
   DayCell/AgendaList AND two `AllocationTrace`s sharing one `occurrenceId` (selection/chat would
   pick the wrong one).
   → *Fixed:* the id now derives from the stable **due-date** (`genDate`, unique per activity),
   and the scheduler refuses to place the same source activity twice on one day (a per-activity
   placed-days exclusion in `evaluateCandidates`). Verified: 0 duplicate occurrence/trace ids,
   0 console errors. Profile essentially unchanged (2900 / 490 / 168).

2. **Month-cell chip flood defeated the density cap.**
   Under the realistic member calendar the scheduler produces 490 substitutions + 168 skips,
   concentrated on Mondays (the weekly pile-up). The "skipped/substituted first" chip sort then
   filled every cell with individual `B fitness` / `X therapy` chips (Mondays hit the +20-more
   overflow), so the month overview was unreadable.
   → *Fixed:* redesigned `DayCell` to one compact **pill per ActivityType** —
   `{Type} {happening} ⟳{substituted} ✕{skipped}` (happening = scheduled+substituted). At most
   5 pills/cell; adaptation is summarised, not enumerated. Per-occurrence detail lives in the
   day timeline. Verified max 5 chip nodes/cell. Acceptance A1/A3/A5 updated to the
   cell → timeline selection flow.

## Moderate — tracked, not yet fixed

3. **Monday therapy pile-up (scheduling quality, now legible).**
   Mondays show e.g. `Therapy 2 ✕12` — ~14 therapy occurrences land on Monday (all weekly
   therapies expand to Monday) and ~12 skip because therapy is tier-5 (allocated last, after
   work/family fill the scarce evening blocking slots). The pill view makes this legible, but
   the longitudinal quality is poor: recovery/downshift sessions cluster-then-skip on Mondays.
   → *Options:* stagger weekly expansion by a per-activity weekday offset (don't pin all weekly
   actions to Monday); or lift recovery therapy out of tier-5 when it has a clinician resource;
   or widen the evening blocking horizon. Deferred — needs a tier/movement rework + re-tune.

4. **Trace tab whitespace for short traces (carries over from 014 #4).**
   A skipped/1-attempt occurrence leaves most of the right panel empty. The temporal trace adds
   slot/score/provenance which fills feasible traces, but skipped ones are still sparse.
   → *Option:* add a "source activity details" sub-panel or a mini-timeline of that activity's
   occurrences below the attempts. Deferred.

## Cosmetic

5. **Two quick actions sharing a slot overlap visually in the day timeline.**
   e.g. 08:00 "Step Count Floor" and "Remote Brisk Walk Fallback" both at 08:00 render as
   overlapping bars (the lower one's text is clipped). Quick actions are allowed to coincide, so
   this is expected; the bars could fan out (split width) when N share a start.
   → *Option:* when k actions overlap, split the action column into k sub-lanes. Deferred.

6. **⟳ glyph legibility.** The substituted badge `⟳N` renders small; the tooltip clarifies
   ("N substituted"). Acceptable; could swap for a clearer mark if a reviewer trips on it.

## What works well (verified)

- **Day timeline** (the headline): member's real day (sleep/work/commute/meals/family) in gray,
  health actions placed around it at real times, substituted actions amber-ringed, skipped listed
  below. Clean and legible. The reviewer demo moment lands.
- **Show occupied slots** toggle: flips 10 busy bars → 0 without moving the actions.
- **Resources Member lane**: 8 category rows (sleep solid, work/commute weekday gaps, travel
  amber bands aligned to the Singapore/Tokyo trips) above equipment/specialist lanes; Jun|Jul|Aug
  date axis. Equipment maintenance (treadmill, ice-bath) bands preserved.
- **Priority**: per-activity scheduled/substituted/skipped bar + `off-window` count (timed
  occurrences outside the preferred window); rows hover + click → Trace.
- **Trace**: chosen slot + score + `policy: explicit/default/llm-hint` provenance; failure kinds
  (memberBusy/temporalRule/...) with detail.
- **Chat**: grounded with the selected occurrence's trace + occupied blocks (date ±1 day); answers
  timing questions ("scheduled at 06:30–07:00 …").
- **Calendar controls**: month switcher (Jun/Jul/Aug), status+type filters, reset, summary header
  totals (2900 / 490 / 168).
- **Mobile (360px)**: Chat | Workspace switch, agenda list, no page errors.

## Verification evidence
- `/tmp/elyx-ux2/calendar-v3.png` — clean per-type pill month overview.
- `/tmp/elyx-ux2/day-timeline.png` — day timeline with occupied blocks + actions.
- Acceptance `tests/drive-acceptance.mjs` A1–A6 → **6/6**; 0 console/page errors across the drive.

## Suggested iteration order
1. (#3) Stagger weekly expansion so therapy/fitness spread across the week instead of piling on
   Monday — biggest longitudinal-quality win.
2. (#5) Fan out overlapping quick actions in the day timeline.
3. (#4) Fill the Trace tab for short/skipped traces.
4. (#6) Glyph polish.
