# 014 - Workspace UI/UX Gaps (post-011/012/013)

## Goal
Capture concrete UI/UX gaps surfaced by a full visual walkthrough of the workspace shell + 6
tabs + LLM chat after 011/012/013 implementation landed. Driven via Playwright across desktop
(1280×900) and mobile (360×800), screenshots saved to `/tmp/elyx-ux-shots/` and
`/tmp/elyx-013-shots/`. The 5-case acceptance suite (`tests/drive-acceptance.mjs`) passes
**5/5 with the real OpenAI key set**, so functional wires are proven. This file is about
**polish, density, and product feel** — not new feature work.

These gaps were not visible at the 5-activity placeholder scale; the 116-activity fixture
exposes them.

> **Relationship to 015 (2026-05-31):** the temporal rewrite in
> `015-temporal-availability-and-scheduler.md` absorbs several items here. To avoid double
> work, treat ownership as:
> - **Already fixed:** #2 (Data-tab duplication + import isolation) — closed via the 009
>   state hoist + ImportPanel-as-toolbar refactor.
> - **Resolved by 015 (implemented + verified):** #1 calendar density (DayCell now shows
>   per-type count pills with ⟳/✕ adaptation badges, ≤5/cell, + the day timeline — see 016 §2),
>   #3 Resources date axis + Member lane, #6 Priority row hover, #9 Priority count wrap
>   (whitespace-nowrap), #11 Upper Body Strength (re-verified under the temporal scheduler).
>   #4 Trace whitespace is partially addressed (slot/score/provenance fill feasible traces;
>   short/skipped traces still sparse — tracked in 016 §4).
> - **Independent polish — still valid regardless of 015:** #5 Trace empty-state guide,
>   #7 AppHeader mobile, #8 Actions title column, #10 chat starter-chip disabled cue.
> - **Re-verify after 015:** #11 Upper Body Strength over-substitution — 015 rewrites the
>   fixtures and scheduler, so the count quirk must be re-checked (it may vanish or move).
> - **Interim option:** if 015 does not start immediately, 015 Review Decision #7 keeps a
>   cheap version of #1 (status-first chip sort + medication collapse) as a standalone patch.

## Severe — fix before any reviewer demo

1. **Calendar density blowout at 116-activity scale.**
   Daily-cadence medications (priority 1, 2, 4, 7, 8, 11, ...) dominate every DayCell's
   3-chip cap. Result: every visible day reads `S medication / S medication / S medication
   / +N more`, with N often in the 25-99 range. Chip titles are entirely truncated by
   `.truncate` because the status glyph + type badge already consume the chip's narrow
   width. The substituted (B) and skipped (X) events that demonstrate the scheduler's
   adaptation are buried behind "+N more" on nearly every day except Jun 1.
   → *Options (pick one or stack):*
   - (a) Sort chips within a DayCell by status priority (skipped/substituted first, then
     scheduled) so adaptation events are always in the top 3 visible slots.
   - (b) Cap medication chips at 1 per day (collapse identical-type repeats into a single
     "Meds × N" chip) — reduces noise dramatically.
   - (c) Increase the chip cap from 3 → 5 (small win, but doesn't fix the medication
     dominance).
   - (d) Move chip title to a tooltip and replace the visible chip text with just the
     type badge + status glyph — accepts the title truncation as a design choice rather
     than a layout failure.
   *Recommended default:* **(a) + (b)** stacked. Surface adaptation by sort, reduce
   medication noise by collapse. Easy to implement; review-friendly impact.

2. **Fixed (2026-05-30) — Data tab duplicated the calendar AND imports didn't propagate.**
   *Resolved:* `displayedResult` / `displayedDiagnostics` were hoisted into
   `AllocatorWorkspace`; `ImportPanel` became a controlled toolbar (no internal
   `CalendarView`); all tabs now read workspace-level state. Original analysis kept below
   for the record.

   `ImportPanel` (009) renders its own `<CalendarView result={displayedResult} />` inside
   the Data tab. Two problems:
   - The Data tab visually duplicates the Calendar tab (same grid below the toolbar).
   - Importing replacement JSON updates only ImportPanel's local `displayedResult`. The
     Calendar / Actions / Priority / Resources / Trace tabs all read the original
     `result` prop threaded from `page.tsx` — they never see the imported data.
   This is a 009-meets-011 integration bug: ImportPanel was designed as a top-level
   wrapper; as a tab sibling it can't broadcast its state to peer tabs without lifting it.
   → *Fix:* hoist `displayedResult` (and `displayedDiagnostics`) into `AllocatorWorkspace`.
   Pass a `setResult(result, diagnostics)` callback down into `DataImportTab` →
   `ImportPanel`. ImportPanel no longer renders its own CalendarView — it just exposes
   the import controls + status indicator. All tabs read the workspace-level result.
   *Cross-file:* updates 009's behavior contract; revise that plan's "ImportPanel renders
   CalendarView" wording (or just note the change in 014's verification).

## Moderate — polish pass

3. **Resources tab timeline bands have no date-axis labels.**
   Visually the bars correctly convey the asymmetric model (equipment defaults green with
   red blocked overlays; specialists default gray with green available overlays). But you
   can't tell from a static glance whether the small red sliver on Home Treadmill is
   Jul 6-12 or Aug 6-12. `title` hover tooltips exist but mobile has no hover.
   → *Fix:* add a slim x-axis tick row above the first section: `| Jun | Jul | Aug |`
   evenly spaced. Optionally subdivide into weeks for the active month. Tap-on-band
   should also surface the range dates inline (the `onSelect({selectedDate, activeTab:
   'resources'})` already fires but the user has no visual hint that the click did
   anything).

4. **Trace tab cards leave massive whitespace below.**
   When a trace has 1-2 attempts, the rest of the right panel is empty. For the Jun 1
   skip, ~80% of the panel is whitespace.
   → *Options:*
   - (a) Add a "Next / previous" navigation: cycle to the next skipped or substituted
     occurrence in the schedule, so users can browse adaptation events.
   - (b) Fill below the trace with a horizontal mini-timeline of all of that source
     activity's occurrences (status-colored squares per occurrence date) — leverages 012's
     diagnostics for richer context.
   - (c) Add a "Source activity details" sub-panel showing the activity's full definition
     (title, frequency, resources, backups) below the attempts.
   *Recommended default:* (c) — simplest, doesn't introduce new navigation patterns.

5. **Trace empty-state is one muted line in a huge empty panel.**
   "Click an occurrence in the Calendar or Resources tab to see how it was allocated."
   → *Fix:* expand to a 3-line guide:
   - "Click any chip in the Calendar tab" (with a small icon).
   - "Click any row in the Priority Queue tab" (currently the doc doesn't mention this).
   - Add a one-click "Show me an example" button that selects the Jun 1 cardiology skip
     as a deterministic demo.

6. **Priority Queue rows are clickable but visually undifferentiated.**
   Per 013 spec, row clicks navigate to Trace tab with the activity's first occurrence
   selected. The rows render with no `cursor-pointer`, no `hover:bg-*`, no other affordance
   — users won't discover the click target.
   → *Fix:* add `hover:bg-gray-50 cursor-pointer` to each row, plus a small `›` glyph at
   the row end that fades in on hover.

## Cosmetic — fix when polishing

7. **AppHeader title cut off above the fold on 360px viewport.**
   On mobile, the visible content opens with "Window: 2026-06-01 → 2026-08-31 · Last
   generated: build-time" — the product name and member label are scrolled off-screen.
   The MobileSwitch (Chat | Workspace) should arguably be the primary mobile navigation
   anchor at top of the visible area, not buried below header text.
   → *Fix:* on mobile, render only the product name + a tiny window badge in AppHeader,
   stack MobileSwitch immediately below as sticky-top. Move "Last generated" + "Member"
   into a kebab menu or omit on mobile.

8. **Actions tab title column too narrow.**
   Activity titles like "Cardiology Review" wrap to 2 lines. The table has 11 columns at
   1280px so each column is squeezed.
   → *Fix:* allow title column to grow with `min-w-48`, truncate locations + facilitator
   columns instead (those are usually shorter values, but the wrap pattern can shift).
   Or: drop the `locations` column to a hover-tooltip; it duplicates information already
   in `resources` for most activities.

9. **Priority Queue count text wraps awkwardly.**
   `S 92 · B 0 · X 0` sometimes wraps the trailing token onto its own line at narrower
   widths, leaving an orphan "X 0" below the row.
   → *Fix:* `whitespace-nowrap` on the count span, or move the count below the bar in a
   small caption row.

10. **Inactive starter chips in chat have only color cue.**
    "Why was this skipped?" and "Walk me through this trace step by step" render in muted
    gray when no selection exists. The lack of cursor + no tooltip means users may try
    to click and wonder why nothing happens.
    → *Fix:* either set `disabled` HTML attribute (so click does nothing AND cursor becomes
    `not-allowed`), or add a `title="Select an occurrence first"` tooltip.

## Data fixture quirks (not UI bugs but worth flagging)

11. **`#15 Upper Body Strength` reports S 0 · B 27 · X 0** in the Priority tab — every
    occurrence is substituted; the primary is never feasible. Likely the primary requires
    a resource that's always unavailable (or backup always wins exclusive capacity).
    → *Action:* inspect `src/data/activities.json` for `act-015` (or whichever id is
    "Upper Body Strength") — check its `resources[]` and `backupActivityIds`. If the
    primary's resource is genuinely never schedulable, either swap primary↔backup or
    fix the fixture. Probably a `roles.ts` mismatch or a typo in role name.

12. **Substituted total = 244** at the 116-activity fixture is plausible given the
    treadmill maintenance week + travel windows + ice-bath outage + physio leave gap.
    Skipped total = 1 is the lone cardiology June consult. The 3313 scheduled +
    244 substituted + 1 skipped sums to 3558 occurrences — reasonable for the dataset.

## Verification evidence

Screenshots:
- `/tmp/elyx-013-shots/A1.png` — Trace tab for Jun 1 cardiology skip (1 attempt, specialist+cardiologist failure).
- `/tmp/elyx-013-shots/A2.png` — Trace tab for Jul 6 substituted fitness (2 attempts, chosen=2, equipment+treadmill failure on attempt 1).
- `/tmp/elyx-013-shots/A3.png` — Resources tab showing 15 equipment + 7 specialists with constraint bands.
- `/tmp/elyx-013-shots/A4.png` — Live OpenAI chat answer citing the occurrence id + constraint type + `[Trace ▍` link mid-stream.
- `/tmp/elyx-013-shots/A5.png` — 360px mobile: MobileSwitch + starter chips + composer.
- `/tmp/elyx-ux-shots/u1-calendar-density.png` — calendar density blowout (#1).
- `/tmp/elyx-ux-shots/u2-actions-tab.png` — Actions table with title-wrapping (#8).
- `/tmp/elyx-ux-shots/u3-priority-tab.png` — Priority Queue with outcome bars (#6 #9).
- `/tmp/elyx-ux-shots/u4-trace-empty.png` — Trace empty-state (#5).
- `/tmp/elyx-ux-shots/u5-data-tab.png` — Data tab duplicates calendar (#2).

## Suggested iteration order

1. **Severe** first: #2 (lift import state into AllocatorWorkspace) is **done**. #1 (calendar
   density) is now owned by 015 — see the Relationship note above; only do the cheap interim
   patch (status-first sort + medication collapse) if 015 is not starting immediately.
2. **Trace polish**: #4 + #5. Cheap, makes the Trace tab feel populated even on simple cases.
3. **Resources axis**: #3. Improves the most informative tab.
4. **Discoverability**: #6 (priority hover) + #10 (chip disabled cue).
5. **Mobile**: #7. Single edit to AppHeader's `md:hidden` styling.
6. **Cosmetic**: #8 + #9. Defer until other items land.
7. **Data**: #11. Inspect + fix the over-substituted fitness activity in
   `src/data/activities.json` directly.

## What this file deliberately does NOT do

- Rewrite 011/012/013 (those are archived and were verified at 5-case acceptance).
- Add new features. All findings are polish / density / discoverability.
- Change the scheduler algorithm or `AllocationTrace` data shape — **within the scope of
  this file** (012 stays as-is here). The separate `015` plan deliberately DOES extend both;
  that is 015's job, not 014's. This file stays polish-only.
- Add a real product header / member-switcher / brand work.
