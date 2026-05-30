# 006 - Render Calendar Output

## Goal

Render the personalized plan (`ScheduleResult`) in a calendar
the reviewer can read at a glance. Success = a reviewer can open the deployed page,
see all 3 months of activities, and immediately distinguish **scheduled**,
**substituted**, and **skipped** occurrences without clicking through docs. Polish is
explicitly NOT a goal — readability and visible adaptation are.

The data contract is fixed by 002. We render `ScheduleResult{ windowStart, windowEnd,
occurrences: ScheduledOccurrence[] }` where each occurrence is whole-day (no clock
times) over the window **2026-06-01 .. 2026-08-31**. We invent **no new fields**.

## Rendering Approach

**Decision: hand-rolled layout (CSS grid + flex). No calendar library.**

Rationale:
- Data is a fixed, precomputed, ~100-activity dataset expanded into per-day
  occurrences. There is no interaction, drag/drop, time-zone math, recurrence parsing,
  or live editing — the exact problems calendar libraries exist to solve.
- Occurrences are whole-day, so we never need an hour grid or time-axis layout.
- A month grid is ~30 cells; an agenda is a grouped list. Both are trivial fl/grid CSS.

Rejected alternatives (speculative per "Simplicity First"):
- **FullCalendar** — heavy, opinionated, time-grid oriented, large bundle; pulls in
  features (event editing, views, plugins) we will never use.
- **react-big-calendar** — same overkill; styling/override friction exceeds the cost of
  ~150 lines of our own grid.
- **A datepicker/scheduler component** — wrong primitive; we display, we don't pick.

Styling: **Tailwind** (the 001 default for responsive layout). This is still the open
question inherited from 001; if Tailwind is dropped, the equivalent plain-CSS modules
work identically. We do not add a component/UI library.

## Primary View & Navigation

**Primary view: a single month grid with a month switcher (Jun / Jul / Aug).**

- Three months stacked at full month-grid size is a lot of vertical scrolling and makes
  it hard to focus; one month at a time with a 3-tab/segmented switcher keeps each view
  scannable while making all data reachable in two clicks.
- The grid is the classic 7-column week layout (Sun–Sat or Mon–Sun; default **Mon-start**),
  leading/trailing days from adjacent months shown as muted, non-interactive cells.

**Secondary affordances:**
- **SummaryHeader** at top: total counts of scheduled / substituted / skipped across the
  whole window (not just the visible month) so the reviewer sees adaptation magnitude
  immediately.
- **FilterBar**: filter by **status** (scheduled/substituted/skipped, multi-toggle) and
  by **type** (fitness/food/medication/therapy/consultation, multi-toggle). Filters apply
  across all months; the active month just shows the filtered subset.
- **Day detail**: clicking a day cell opens a **DayDetail** panel/expansion listing every
  occurrence for that day as full OccurrenceCards (the cell itself only shows compact chips).

Density note: daily medication/food will pack many cells. The grid cell shows compact
chips (capped, with a "+N more" affordance); the full content lives in the day-detail
expansion and in the mobile agenda. This keeps the month grid readable even on dense days.

## Occurrence Card Content (glance vs detail)

A `ScheduledOccurrence` has exactly these fields (002, fixed): `id, date, status,
sourceActivityId, effectiveActivityId?, title, type, details, facilitatorLabel,
location, isRemote, prep[], metrics[], durationMinutes, boundResources[],
skipAdjustment?, reason`.

**Compact chip (in a month-grid cell):**
- Type color dot/border + status accent.
- `title` (truncated).
- A tiny status marker for non-scheduled (e.g. strikethrough/dimmed for `skipped`, a
  swap glyph for `substituted`).
- Remote glyph when `isRemote`.

**OccurrenceCard (in DayDetail / mobile agenda — full detail):**
- Header: `title`, type badge (color-coded), status badge (color-coded).
- `facilitatorLabel`, `location`, remote indicator (from `isRemote`).
- `durationMinutes` (rendered as e.g. "45 min").
- `details` (one line / short paragraph).
- `prep[]` as a small bullet list (omit section if empty).
- `metrics[]` as a small bullet list / chips (omit if empty).
- `boundResources[]` listed compactly (omit if empty).
- **If `status === 'substituted'`**: show that `effectiveActivityId` replaced
  `sourceActivityId` (e.g. "Backup: <effective> replaced <source>") plus `reason`.
- **If `status === 'skipped'`**: show `skipAdjustment` (if present) and `reason`,
  rendered visibly (dimmed but NOT hidden) so the adaptation is auditable.
- `reason` is shown for any non-scheduled status; for scheduled it may be omitted if empty.

## Status & Type Visualization (legend / colors)

A persistent **Legend** documents both keys. Suggested palette (final hex tunable in code):

**Status (primary signal):**
- `scheduled` — green accent (e.g. emerald) — normal, solid card.
- `substituted` — amber accent — card shows the swap.
- `skipped` — gray/slate, dimmed + subtle strikethrough on title — **still rendered**.

**Type (secondary signal, dot/border color):**
- `fitness` — blue
- `food` — orange
- `medication` — red
- `therapy` — purple
- `consultation` — teal

Status drives the card's overall treatment; type drives a small colored dot/left-border.
Both appear in the Legend. Skipped items are never filtered out by default.

## Density & Mobile Handling

**Dense days (desktop grid):** each cell renders up to ~3 compact chips, then a
"+N more" line. Clicking the cell opens DayDetail with the full ordered list. Cells have a
max-height with internal scroll as a fallback so the grid never blows up vertically.

**Mobile / narrow widths:** the 7-column grid is not readable on phones. Below a breakpoint
(~`md`), the calendar **collapses to a single-column vertical agenda** grouped by week, then
by day, showing only days that have occurrences (after filters). Each day renders its
OccurrenceCards stacked. The month switcher, SummaryHeader, FilterBar, and Legend persist.

The agenda layout is also the natural desktop "expanded day" representation, so DayDetail and
the mobile agenda share the OccurrenceCard component — no duplicate rendering logic.

## Baseline Data Flow (static fixtures -> prop)

This page IS the 001 "first screen" — there is **no throwaway landing page**.

1. The static route (`src/app/page.tsx`) imports the committed activities + availability
   fixtures and calls `schedule(...)` (from 002/005) during server/static route render. Next.js
   can prerender the route; the required baseline does not fetch data and does not require
   browser-side scheduling.
2. The resulting `ScheduleResult` is passed as a prop into `<CalendarView result={...} />`.
3. `CalendarView` derives view state (selected month, active filters) **client-side** from
   the static prop. All filtering/month-switching is pure in-memory transformation of the
   already-computed `occurrences` — no recompute of the schedule in the required baseline.

So: static fixture compute -> serialized into the static page -> `CalendarView` prop -> render.
Optional 009 may add a separate browser-side import flow that reruns `schedule()` with uploaded
JSON and then passes the new `ScheduleResult` into the same `CalendarView`.

## Component Breakdown

Minimal tree (no over-componentization):

```
CalendarView                 // owns selectedMonth + filter state, derived from `result` prop
├── SummaryHeader            // window-wide counts: scheduled / substituted / skipped
├── FilterBar                // status + type multi-toggles; month switcher (Jun/Jul/Aug)
├── Legend                   // status colors + type colors key
└── (responsive)
    ├── MonthGrid            // desktop: 7-col grid for selected month
    │   └── DayCell          // compact chips + "+N more"; click -> DayDetail
    │       └── DayDetail    // expansion/panel: full OccurrenceCards for that day
    └── AgendaList           // mobile: week->day grouped vertical list
        └── OccurrenceCard   // shared full-detail card (used by DayDetail and AgendaList)
```

`OccurrenceCard` is the single source of truth for full occurrence rendering; the compact
chip is a small inline render inside `DayCell` (not its own file unless it grows). Filtering
helpers (group-by-day, counts, status/type filter) live in a small pure util, not in the
components.

## Tasks

1. Create the static route `src/app/page.tsx` that imports committed inputs, runs `schedule()`
   during server/static route render, and renders `<CalendarView result={result} />`. Remove any placeholder
   landing content (this page is the calendar).
2. Build `CalendarView`: hold `selectedMonth` (Jun/Jul/Aug) and `filters` (status[], type[])
   state; compute filtered occurrences from the `result` prop with a pure util.
3. Build `SummaryHeader` with window-wide scheduled/substituted/skipped counts.
4. Build `FilterBar` (status + type multi-toggles) and the month switcher.
5. Build `Legend` for status colors and type colors.
6. Build `MonthGrid` + `DayCell` (7-col, Mon-start, muted adjacent-month days, compact chips
   with "+N more", max-height + scroll fallback).
7. Build `DayDetail` expansion and `OccurrenceCard` rendering all fields per the spec above,
   including substituted (effective vs source + reason) and skipped (skipAdjustment + reason).
8. Build `AgendaList` (week->day grouping) and wire responsive swap: grid on `md+`, agenda
   below.
9. Ensure skipped items render visibly by default (dimmed, not removed).
10. Verify `npm run build` succeeds (static render, no client compute) and manually check
    desktop + mobile widths.

## Open Questions / Decisions Needed

- **Tailwind vs plain CSS (inherited from 001) — RESOLVED: Tailwind.** Use Tailwind utility
  classes for the responsive month-grid / mobile-agenda layout.
- **Day-detail UX: inline expansion vs modal/side panel.** RECOMMENDED DEFAULT: **inline
  expansion under the grid** (simplest, no focus-trap/overlay code). Revisit only if it makes
  the grid jump awkwardly.
- **Chip cap per cell before "+N more".** RECOMMENDED DEFAULT: **3**. Pure readability knob,
  cheap to change.
- **Week start (Mon vs Sun).** RECOMMENDED DEFAULT: **Monday**. Cosmetic.
- **Filtered-empty days in agenda.** RECOMMENDED DEFAULT: **hide days with zero matches**;
  keep month grid cells present but empty so the calendar shape stays intact.

## Verification

- `npm run build` succeeds; the required baseline route is statically renderable with no fetch.
- Opening the deployed/preview page shows the **calendar as the first screen** (no landing
  page).
- All three months (Jun/Jul/Aug) are reachable via the month switcher and render their
  occurrences.
- SummaryHeader counts match the dataset's scheduled/substituted/skipped totals.
- A reviewer can find and read a **scheduled**, a **substituted** (sees which backup replaced
  what + reason), and a **skipped** (sees skipAdjustment + reason) occurrence — skipped items
  are visible, not hidden.
- Status and type color keys match the Legend.
- Filters (status, type) correctly subset what's shown across months.
- Manual responsive check: at a desktop width the month grid renders readably; at a narrow
  (mobile) width it collapses to the single-column agenda and remains readable.
