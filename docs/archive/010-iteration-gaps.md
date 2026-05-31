# 010 - Iteration Gaps (Post-Verification, Surface Polish)

> **CLOSED (2026-05-31).** All items resolved or folded forward:
> - #7 filtered-count subline — **done** (SummaryHeader "Showing N of M (filters active)").
> - #9 chip glyph — **done** in 016 (legible B/X outcome glyphs).
> - #11 mobile chip tap-to-expand — **subsumed** by 016 (mobile AgendaList → per-day rows +
>   expandable DayTimeline).
> - #16 hosted URL — **done** via 008 (README points to https://elyx-oa.vercel.app/).
> - #18 edge-case scheduler tests — superseded by the 015 temporal suite (33 unit tests incl.
>   overlap / temporal-rule / capacity cases). No standalone work needed.
> Archived.

## Goal
Surface-level polish + cross-cutting fixes surfaced by the `verify` skill run (npm install →
npm run build → drive the dev server via Playwright across desktop + mobile). The build is
green, `npm test` passes, all features wired end-to-end, and the scheduler demonstrably
adapts to engineered conflicts in `availability.json`. Gaps below are real but
bounded — each item is a small targeted fix, not architecture.

> **Scope split (2026-05-30):** product-direction items raised in review (`AllocatorWorkspace`
> shell, scheduler diagnostics, explainability tabs + chat, acceptance tests) have been moved
> out of this file into dedicated plans so this list stays a tactical polish pass:
> - **011** `011-allocator-workspace-shell.md` — chat-left / tabs-right shell, app header, selection model, mobile nav, ImportPanel wired in.
> - **012** `012-scheduler-diagnostics.md` — `AllocationTrace` data structure (full trace per attempt).
> - **013** `013-explainability-tabs-and-chat.md` — six right-panel tabs + real LLM-backed chat + acceptance Playwright tests.
>
> 010 ⊥ 011 ⊥ 012 are parallel-shippable; 013 blocks on 011 + 012. Cross-file: 013 requires
> `008-host-and-prepare-submission.md` to be amended to allow an LLM-API-key env var on Vercel.

## Build / Tooling

1. **`vitest.config.ts` was inside `tsconfig.json` include** and broke `next build` due
   to a vite/vitest peer-version type mismatch. → *Fixed in place:* moved it to `exclude`.
   Watch for recurrence if vitest version drifts.
2. **9 npm-audit vulnerabilities** (5 moderate, 4 high) reported by `npm install`.
   → *Defer:* none are in our app code's runtime path; address only if `npm audit`
   surfaces a true exploit. Don't `npm audit fix --force` blindly (breaking changes).
3. **`npm test` (Vitest) now passes.** The scheduler and fixture checks pass locally
   (`src/lib/scheduler.test.ts`, 13 real tests plus 5 diagnostic todos). → *Keep:*
   gate any further scheduler or fixture edits on green.
4. **No CI.** Per backlog 008, the deploy gate is local-only. A 3-step GitHub Action
   (`npm ci` / `npm run build` / `npm test`) would be a small win but is explicitly
   out-of-scope for the take-home.

## Functional Bugs (fixed in this pass)

5. **DayDetail rendered off-screen.** Clicking "+N more" on day 1 of June expanded
   the DayDetail panel at y=966 (66px below a 900px viewport) with height 1288px.
   Functionally correct (DOM present, Close worked) but invisibly so to the user.
   → *Fixed:* `MonthGrid.tsx` now scrolls the panel into view via a `ref + useEffect`
   on `expandedDate` change with `scrollIntoView({ behavior: 'smooth', block: 'start' })`.

## UI / UX Polish (not yet fixed)

6. **Fixed — Mobile month switcher now drives `AgendaList`.** `CalendarView` threads
   `month` into `AgendaList`, which filters occurrences by date prefix. Verified at
   360 px: agenda shows only `Week of 2026-06-*` rows when Jun is active (previously
   all three months).

7. **(Open, deferred.) SummaryHeader counts don't reflect filters.** Badges show
   3313/244/1 even with all filters off. Defensible (schedule total vs filtered subset)
   but disorienting when the grid is visibly empty. → *Recommended:* add a
   "showing N of M" subline, only rendered when any filter is off.

8. **Fixed — Empty-state notice when filters match zero occurrences.** `MonthGrid`
   and `AgendaList` each render a dashed "No occurrences match current filters" notice
   when their visible-occurrence count is 0. Pairs with #12's Reset link.

9. **(Open, cosmetic, deferred.) Chip status glyph is small** at `text-[10px]`.
   Current S/B/X glyphs do disambiguate substituted vs skipped. Defer — color carries
   most of the signal already.

10. **Fixed — DayDetail Close affordance is now a circular ✕ button.** Replaced the
    text link with `rounded-full bg-gray-200 w-7 h-7 ✕` with `aria-label="Close"`.
    Larger tap target on mobile.

11. **(Open, deferred.) Truncated chip titles lose info on mobile.** Tap-to-expand
    would require non-trivial state plumbing. Will be revisited when 014's calendar
    density work lands (the user is holding that for an architectural decision).

12. **Fixed — Reset filters link added to `FilterBar`.** Always visible (when
    `onReset` is provided by parent). Clicking restores all status + type filters to
    "on". Verified: empty-state notice clears after clicking Reset.

## Data / Content Gaps

13. **Fixed — Cardiology Review text now matches its monthly cadence.**
    `src/data/activities.json` describes `act-003` as a monthly cardiovascular review.

14. **Fixed — sample dataset now clears the assignment floor.**
    `src/data/activities.json` contains 116 records: 102 primary activities plus
    14 backup-only fallback templates. Primary distribution is exactly fitness 28,
    food 24, medication 22, therapy 16, consultation 12.

15. **Fixed — backup coverage is now realistic while preserving the skip demo.**
    Most primary activities declare same-type no-resource fallbacks; `act-003`
    intentionally keeps no backup so the June cardiology skip remains visible.

## Cross-Cutting

16. **(Open.) Hosted URL placeholder in README is still `TODO once deployed`.**
    Backlog 008 fills this once Vercel is wired up.
17. **Fixed — `validate.ts` guards now run at the build-time boundary.** `page.tsx`
    iterates `activities.json` with `isActivity` (per-element) and runs
    `isAvailabilityBundle` on `availability.json`. Malformed JSON throws at module
    evaluation and breaks the build instead of rendering broken occurrences.
18. **(Open, optional.) Edge-case test coverage is thin.** Every test in
    `scheduler.test.ts` has a concrete body — but the harder cases (multi-resource
    activity with one constrained sub-resource, role-pool fallback, year/n>1
    placement) aren't covered. Add 2-3 more tests if a regression surfaces.
19. **Fixed — Favicon added.** `src/app/icon.svg` ships a tiny Elyx mark; served at
    `/icon.svg` (200) by Next.js's App Router convention. `GET /favicon.ico 404`
    console error is gone.

## Remaining open items

After this iteration pass:
- **#7** filtered-count "showing N of M" subline — deferred.
- **#9** chip glyph cosmetic — deferred (S/B/X disambiguate adequately).
- **#11** mobile chip tap-to-expand — deferred to 014's calendar density work.
- **#16** hosted URL placeholder — pending 008 deploy.
- **#18** edge-case test coverage — optional.

## Suggested Iteration Order (now reduced)

The original quick-wins / mobile / validation buckets all landed this pass. Remaining:

1. **Deploy** — #16 via `docs/DEPLOY.md` (amend for `OPENAI_API_KEY` env var per the
   archived 013 plan's Task §0 before running).
2. **014 architectural decision** — calendar density / chip sorting (held back by user).
3. **Optional polish** — #7 (filtered counts) + #18 (more scheduler tests).

Items #11 and #12 may be partially or fully subsumed when 011's shell lands. Re-check
before doing them as standalone work.

## Verification Evidence

Screenshots saved under `/tmp/elyx-shots/`:
- `01-initial.png` — Jun grid, all 3 visible conflicts (Jun 1 cardio skipped X, Jun 22 fitness B, therapy X during travel).
- `02-jul.png` — Jul 1 cardio scheduled S; treadmill maintenance (Jul 6-12) all fitness B; ice-bath outage (Jul 20-22) therapy X.
- `03-aug.png` — Aug 1 cardio scheduled S; Tokyo travel (Aug 10-14) substitution + skip.
- `06-day-expanded.png` — Jun 1 expanded, "+1 more" became "hide" (state OK).
- `09-day-detail-after-scroll.png` — DayDetail in-viewport after the scroll-into-view fix.
- `11-jul-substituted-cell-crop.png` — close-up of substituted chip (amber B glyph).
- `12-mobile-360-top.png` — Mobile AgendaList renders cleanly at 360px.
- `14-all-filters-off.png` — All status filters off → empty grid (graceful degradation).

Build: `npm run build` exits 0; `/` prerendered as `○ (Static)`, 94.6 kB First Load JS.
Tests: `npm test` passing.
Runtime: 0 `pageerror` / `console.error` events (after favicon #19) across the full driver session.

Additional data-gap closure on 2026-05-30:
- `src/data/activities.json` expanded from 5 placeholder activities to 116 records
  (102 primary + 14 backup-only fallbacks).
- Added fixture integrity tests for schema, distribution, priorities, backup chains,
  role vocabulary, and canonical scheduling outcomes.
- `npm test` passes (13 real tests, 10 todo placeholders).
- `npm run build` passes; `/` prerenders successfully with the larger fixture.
- Playwright smoke at `http://127.0.0.1:3001/` rendered the app with no console errors.
