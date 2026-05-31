# 016 - Temporal UI/UX Verification (post-015)

## Goal
Record a full feature-by-feature UI/UX verification of the **temporal** app (015) driven via
Playwright across desktop (1280×900) and mobile (360×800), and the gaps it surfaced. This is
the 015-era analogue of 014 (which verified the pre-temporal 011/012/013 build). Screenshots
under `/tmp/elyx-ux2/`.

The temporal scheduler exposed density/identity issues that did not exist at the date-only
scale. The two **severe** ones were fixed in the same pass; the rest are tracked below.

> **Deployed audit addendum (2026-05-31):** a manual pass against
> `https://elyx-oa.vercel.app/` kept the automated checks green (`npm test` 26/26,
> acceptance A1-A6 6/6, 0 console warnings/errors), but found additional UX gaps that
> the acceptance script did not cover. Those are folded into the open list below.

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

5. **Day timeline same-slot stack hides most actions.** ✅ FIXED
   This is larger than the original "two quick actions overlap" cosmetic note. On the deployed
   June 1 timeline, 14 actions share `06:30-07:00`, 14 share `12:00-12:30`, and 11 overlap the
   `08:00` band (`08:00-08:30` + `08:00-09:00`). They render at the same x/y, so only the top
   visual layer is readable even though all buttons exist in the DOM.
   → *Fixed:* `DayTimeline` now groups bars by identical `{start,end}` slot (a group renders as
   `{time} ×N`) and lane-packs the groups (cap 4 lanes) so overlaps fan out. A reliable
   chronological **action list** below the lane guarantees every action is readable + selectable
   regardless of packing. Verified: max bars sharing one y-position dropped 14 → 2; the list shows
   all 47 actions for Jun 1.

6. **Priority `off-window` count is inconsistent with scheduler traces.** ✅ FIXED
   The Priority tab computed off-window from `activity.temporalPolicy ?? getDefaultTemporalPolicy`
   and only checked the raw start time — ignoring the scheduler's policy merge
   (`explicit > validated hint > default`) and anchor allowance. `act-001` showed `92 off-win`,
   but its trace chooses `06:30-07:00`, `policy: llm-hint`, `score 0` (the wake anchor makes it
   acceptable).
   → *Fixed:* the scheduler now emits `ScheduledOccurrence.outsidePreferredWindow` (computed from
   the same `inPreferred` check it scores with, including anchor allowance). The Priority tab reads
   that boolean and no longer rederives policy semantics. Verified: `act-001` off-win 92 → 0.

7. **Data tab import path used the WRONG scheduler + omitted hints.** ✅ FIXED
   Worse than first noted: `ImportPanel.rerun()` called the date-only `scheduleWithDiagnostics`,
   so a rerun after import produced occurrences with no `startTime`/`endTime` — the calendar
   timeline would render empty. It also ignored the 015 hints lifecycle.
   → *Fixed:* rerun now calls `scheduleTemporal`. Committed `scheduling-hints.json` is applied only
   if `validateHintReferences` passes against the (possibly imported) bundle, else it falls back
   deterministically; a status line reports which (`committed hints applied (valid for import)` /
   `… → deterministic fallback policies`). Verified: import + Rerun yields 47 timed actions on
   Jun 1 (was 0 under the date-only bug) and the status line renders.

8. **Chat starter scope ambiguous after a selection; mobile link nav silent.**
   With `occ-act-001-2026-06-01` selected, the global starter "What changed during travel?"
   answered only that selected non-travel occurrence. And on mobile, clicking a response's
   `[Trace]`/`[Calendar]` link updated workspace state but left the user in the Chat pane.
   → *Mobile link nav FIXED:* ✅ `select()` now brings the Workspace pane forward whenever an
   `activeTab` change occurs (chat links + tab clicks), so `tab://`/`trace://` links navigate
   visibly on mobile.
   → *Starter scope DEFERRED:* giving starters explicit selected-vs-global scopes is a
   prompt/UX design change; tracked, not yet done.

9. **Mobile workspace density/navigation regressed under temporal scale.** ✅ FIXED
   At 360px the tab strip clipped `Trace`/`Data`, and the mobile Calendar agenda rendered an
   `OccurrenceCard` per occurrence — ~1189 cards for June (an inner-scroll wall; the "400k px"
   figure was that scroll container), making mobile calendar unusable.
   → *Fixed:* `AgendaList` now renders one compact **summary row per day** (date + per-type count
   pills with ⟳/✕, mirroring DayCell) that taps to expand a `DayTimeline` inline — drill into one
   day, not 1189 cards. Verified: article cards 1189 → 0, replaced by per-day rows. The tab strip
   is compacted on small screens (`px-2 text-xs`) so all six tabs are visible/scrollable (rightmost
   edge 458px → 361px).

10. **Substitution action-list labels hide the source activity.** ✅ FIXED
    Deployed verification found four separate `08:00 Remote Brisk Walk Fallback` rows on Jun 1 —
    distinct substituted occurrences from `act-010`/`act-024`/`act-049`/`act-060` all using
    backup `act-103`. The UI rendered only the effective fallback title, so reused fallbacks looked
    like duplicates.
    → *Fixed:* `buildOccurrence` denormalizes the source title onto substituted occurrences
    (`ScheduledOccurrence.sourceTitle`); `DayTimeline` renders `Remote Brisk Walk Fallback ←
    Lower Body Strength` in the action list + the bar tooltip. Verified on Jun 1: the four rows now
    read ← Lower Body Strength / Row Erg Intervals / VO2 Max Primer / Loaded Carry Session.

11. **Food/medication micro-actions need scheduler-emitted display bundles.** ✅ FIXED
    *(Decisions 2026-05-31: deterministic bundler, LLM labels optional; only scheduled low-risk
    daily food/med collapse; Calendar + chat grounding render bundles.)*
    → *Fixed:* `src/lib/bundle.ts` `bundleAssignment(activity, policy)` deterministically groups
    by `(type, resolved anchor)` into labelled buckets (Morning meds, Breakfast/Lunch/Dinner
    nutrition, Bedtime meds), keyed by the LABEL so anchor variants (wake/breakfast → "Morning
    meds") consolidate. The temporal scheduler tags ONLY scheduled occurrences via
    `displayBundleId`/`displayBundleLabel`; **guardrail verified** — skipped, substituted,
    monitoring (BP/CGM via their device resource), and all blocking actions are never bundled
    (unit-tested). `DayTimeline` renders each bundle as one expandable row/bar ("Morning meds ×4");
    the mobile `AgendaList` inherits it. Chat grounding gains `dayBundles` so it can answer routine
    questions. Verified Jun 1: action list 47 flat rows → 12 (5 named bundles + individual
    skips/subs/blocking); 18 micro food/med collapsed into 5 bundles; 0 console errors.
    → *Deferred (optional):* the LLM label-refinement pass (`generate:bundles` →
    `calendar-bundles.json`). The bundler accepts `labelOverrides` and is unit-tested for it; the
    committed labels are deterministic in code for now.

    *(original analysis below)*
    Jun 1 visibly carries `Food 15` and `Meds 16`; the action list then exposes every hydration,
    fiber, caffeine, supplement, monitoring, and medication check as its own row. The scheduler is
    applying temporal safety rules (anchors, member-busy overlap, temporalRule checks), but it does
    **not** apply a hard "max visible food/med actions per day" cap. This was an explicit 015 V1
    decision: `maxPerDay` was excluded; daily overload is only a soft score, and UI summarization
    was expected to collapse low-risk daily actions.
    → *Root cause:* the data fixture models many lifestyle micro-habits as separate daily
    `food`/`medication` activities (12 daily food + 9 daily medication primaries), and quick
    actions under 20 minutes are allowed to share time slots. That is fine for an allocator trace
    ledger, but too noisy for a customer-facing calendar.
    → *Direction:* introduce scheduler-emitted display bundles, not bland `06:30 ×10` groups.
    The customer-facing Calendar should show named bundles such as `Morning meds`, `Breakfast
    setup`, `Lunch nutrition checks`, `Dinner routine`, and `Bedtime meds`; clicking a bundle
    expands the raw actions and trace links inside it. Keep the raw occurrence ledger intact for
    Trace/debug mode.
    → *LLM-assisted compiler:* use a cheap/fast model pass (for example `gpt-5-mini` if available
    in the configured provider) to generate durable bundle metadata from `activities.json`:
    `bundleId`, member-facing `label`, description, semantic category, anchor/window, and the
    activity ids that belong in the bundle. Commit this as a fixture, e.g.
    `src/data/calendar-bundles.json`, with schema validation and deterministic fallback rules when
    no model/key is available.
    → *Scheduler responsibility:* after `scheduleTemporal` places raw occurrences, run a pure
    bundling step in `src/lib/` that assigns `displayBundleId` / `displayBundleLabel` per
    occurrence and emits `CalendarDisplayBundle[]` per day. The UI should render these scheduler
    bundles by default, not infer grouping from titles/times in React. This keeps import/rerun,
    chat grounding, Trace, Priority, and Calendar all aligned.
    → *Acceptance target:* default Jun 1 customer view should have a small number of named bundles
    instead of `06:30 ×14`, `12:00 ×14`, `Food 15`, `Meds 16`; expanding bundles should still reveal
    all 47 raw actions and preserve individual Trace selection.

## Cosmetic

12. **⟳ glyph legibility.** The substituted badge `⟳N` renders small; the tooltip clarifies
    ("N substituted"). Acceptable; could swap for a clearer mark if a reviewer trips on it.

## What works well (verified)

- **Day timeline** (the headline): member's real day (sleep/work/commute/meals/family) in gray,
  health actions placed around it at real times, substituted actions amber-ringed, skipped listed
  below. Same-slot grouping + the chronological list make all actions reachable; substituted rows
  still need source labels (#10), and food/med micro-actions need bundling (#11).
- **Show occupied slots** toggle: flips 10 busy bars → 0 without moving the actions.
- **Resources Member lane**: 8 category rows (sleep solid, work/commute weekday gaps, travel
  amber bands aligned to the Singapore/Tokyo trips) above equipment/specialist lanes; Jun|Jul|Aug
  date axis. Equipment maintenance (treadmill, ice-bath) bands preserved.
- **Priority**: per-activity scheduled/substituted/skipped bar; rows hover + click → Trace;
  `off-window` now reads scheduler-emitted semantics.
- **Trace**: chosen slot + score + `policy: explicit/default/llm-hint` provenance; failure kinds
  (memberBusy/temporalRule/...) with detail.
- **Chat**: grounded with the selected occurrence's trace + occupied blocks (date ±1 day); answers
  selected-occurrence timing questions ("scheduled at 06:30–07:00 …"). Starter scoping needs #8.
- **Calendar controls**: month switcher (Jun/Jul/Aug), status+type filters, reset, summary header
  totals (2900 / 490 / 168).
- **Mobile (360px)**: Chat | Workspace switch works, tab strip is compacted, and the Calendar uses
  per-day summary rows with expandable timelines.

## Verification evidence
- `/tmp/elyx-ux2/calendar-v3.png` — clean per-type pill month overview.
- `/tmp/elyx-ux2/day-timeline.png` — day timeline with occupied blocks + actions.
- Acceptance `tests/drive-acceptance.mjs` A1–A6 → **6/6**; 0 console/page errors across the drive.
- Deployed audit (2026-05-31): public Vercel URL, `npm test` → **26/26**,
  `BASE_URL=https://elyx-oa.vercel.app/ node tests/drive-acceptance.mjs` → **6/6**,
  manual desktop/mobile pass → 0 console warnings/errors; new findings #5-#9.
- Deployed duplicate-label check (2026-05-31): Jun 1 has four `08:00 Remote Brisk Walk Fallback`
  rows, traced to distinct sources `act-010`, `act-024`, `act-049`, `act-060`; logged as #10.
- Calendar density root-cause check (2026-05-31): fixture has 12 daily food + 9 daily medication
  primary activities; Jun 1 renders `Food 15` / `Meds 16`; logged as #11.

## Fix pass (2026-05-31) — addressed #5, #6, #7, #8 (mobile nav), #9

Driven + verified on a local dev server; acceptance A1–A6 → 6/6, 26 unit tests, 0 console errors.
- #5 day-timeline grouping + lane-packing + action list (14 → 2 max stack).
- #6 scheduler emits `outsidePreferredWindow`; Priority reads it (act-001 92 → 0 off-win).
- #7 ImportPanel reruns on `scheduleTemporal` + validated hints + status line (47 timed actions
  after import; was 0).
- #8 mobile link nav: `select()` raises the Workspace pane on any `activeTab` change.
- #9 mobile AgendaList → per-day summary rows + expandable timeline (1189 cards → 0); tab strip
  compacted to fit/scroll all six tabs.
- *Orphan:* `src/components/OccurrenceCard.tsx` is no longer imported (DayCell/AgendaList/DayDetail
  all moved to pills/timeline). Left in place (pre-existing component); safe to delete later.

## Review pass 2 (2026-05-31) — fresh hands-on audit + fixes

Drove every surface again (desktop + mobile, 0 console errors). Fixes shipped this pass:
- **#3 (partial):** staggered weekly expansion (per-activity weekday offset — Monday skips
  342 → 20) + consultations may overlap `work` (member steps out for an appointment), so all
  consultations now schedule (act-003 cardiology S 0 → 2, Jun skip preserved). Never-scheduled
  activities 50 → 38; the remainder is genuine fitness/therapy capacity (more blocking workouts
  than focused slots around a 9-5 + family) → honest substitution to remote walks.
- **A** legible `B`/`X` outcome glyphs on calendar pills (was illegible ⟳/✕).
- **B** one-item "bundles" render as the raw action.
- **C** Trace dedupes identical failed constraints with `(×N)` (cardiology skip 7 → 2 lines).
- **D** "HH:MM ×N" timeline groups hint their content ("· N sub").
- **E** Actions tab 11 → 7 columns + scheduling **outcome (S·B·X)** column + sticky header.
- **F** mobile collapses status/type filters behind a "Filters" toggle (month stays visible).
- **G** dropped the redundant Legend row. (`Legend.tsx` now orphaned, left in place.)

## Still open (tracked)
- **#3 (remainder)** fitness/therapy capacity — ~38 activities can't all fit the limited focused
  slots; they substitute to remote walks. Genuinely needs either lighter member busy blocks or a
  tier rework. The Trace explains each honestly.
- **#4** Trace whitespace for short/skipped traces.
- **#8 (starter scope)** explicit selected-vs-global chat starters.
- **#11 (optional)** LLM label refinement for bundles (`generate:bundles` → `calendar-bundles.json`);
  deterministic labels ship today.

## Bundle pass (2026-05-31) — addressed #10, #11

- #10 substituted rows show `← source` (ScheduledOccurrence.sourceTitle).
- #11 deterministic display bundles: `src/lib/bundle.ts` + scheduler tagging (scheduled-only,
  guardrail unit-tested) + DayTimeline/AgendaList expandable bundle rows + chat `dayBundles`.
  Jun 1 day list 47 → 12 rows. 33 unit tests, 6/6 acceptance, build static, lint clean, 0 errors.
- `OccurrenceCard.tsx` remains orphaned (left in place).
