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

## Cosmetic

10. **⟳ glyph legibility.** The substituted badge `⟳N` renders small; the tooltip clarifies
    ("N substituted"). Acceptable; could swap for a clearer mark if a reviewer trips on it.

## What works well (verified)

- **Day timeline** (the headline): member's real day (sleep/work/commute/meals/family) in gray,
  health actions placed around it at real times, substituted actions amber-ringed, skipped listed
  below. The overall structure lands; same-slot action stacking is the blocker in #5.
- **Show occupied slots** toggle: flips 10 busy bars → 0 without moving the actions.
- **Resources Member lane**: 8 category rows (sleep solid, work/commute weekday gaps, travel
  amber bands aligned to the Singapore/Tokyo trips) above equipment/specialist lanes; Jun|Jul|Aug
  date axis. Equipment maintenance (treadmill, ice-bath) bands preserved.
- **Priority**: per-activity scheduled/substituted/skipped bar; rows hover + click → Trace.
  `off-window` count rendering exists, but the count semantics need #6.
- **Trace**: chosen slot + score + `policy: explicit/default/llm-hint` provenance; failure kinds
  (memberBusy/temporalRule/...) with detail.
- **Chat**: grounded with the selected occurrence's trace + occupied blocks (date ±1 day); answers
  selected-occurrence timing questions ("scheduled at 06:30–07:00 …"). Starter scoping needs #8.
- **Calendar controls**: month switcher (Jun/Jul/Aug), status+type filters, reset, summary header
  totals (2900 / 490 / 168).
- **Mobile (360px)**: Chat | Workspace switch works and produces no page errors. Navigation and
  calendar density need #9 before mobile is demo-ready.

## Verification evidence
- `/tmp/elyx-ux2/calendar-v3.png` — clean per-type pill month overview.
- `/tmp/elyx-ux2/day-timeline.png` — day timeline with occupied blocks + actions.
- Acceptance `tests/drive-acceptance.mjs` A1–A6 → **6/6**; 0 console/page errors across the drive.
- Deployed audit (2026-05-31): public Vercel URL, `npm test` → **26/26**,
  `BASE_URL=https://elyx-oa.vercel.app/ node tests/drive-acceptance.mjs` → **6/6**,
  manual desktop/mobile pass → 0 console warnings/errors; new findings #5-#9.

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

## Still open (tracked)
- **#3** Monday weekly pile-up (scheduling quality) — stagger weekly expansion across the week.
- **#4** Trace whitespace for short/skipped traces.
- **#8 (starter scope)** explicit selected-vs-global chat starters.
- **#10** ⟳ glyph polish.
