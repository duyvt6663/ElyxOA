# 011 - Allocator Workspace Shell

## Goal
Replace the single calendar route with a two-panel **chat-left / tabs-right workspace**
that becomes the new V1 home for the Elyx Resource Allocator. This file owns the
*shell* only — the app header, panel layout, shared selection model, mobile navigation,
and wiring the existing `CalendarView` and `ImportPanel` into a tab container. The
six tabs' real content and the LLM-backed chat surface live in **013**; the
diagnostics data the right panel needs lives in **012**.

This is a pure UI restructure — no new scheduler logic, no new data, no backend.

## Why this shell

Currently `src/app/page.tsx` renders `<main><CalendarView result={result} /></main>`.
The teammate's review (010 §19, #21, #25, #26, #27) identified that:
- The first visible text on the page is a date window and status chips — it reads as a
  calendar report, not as an "allocator" the user can talk to and inspect.
- `ImportPanel` exists but is not in the route; you can't reach it.
- A single calendar view can't surface "why?" — there is no Resources view, no
  Allocation Trace, no priority queue.

A chat-left + tabs-right shell directly supports the "talk to the allocator, inspect the
evidence on the side" posture without committing to anything more than layout in 011.

## Reference patterns

The pattern is already in use in this user's other project. Cite, study, do not copy
verbatim — the dependencies, theming, and data contracts differ.

- `/Users/duyvt6663/github/app/src/components/organisms/window-layout.tsx` — persistent
  left + right panel container with a divider; mobile collapse pattern.
- `/Users/duyvt6663/github/app/src/components/organisms/chat/chat.tsx` — full-height
  chat root, scrollable message list, bottom-pinned composer, bottom fade-out.

Read both before drafting `AllocatorWorkspace`. Reuse Tailwind class shapes
where they fit; don't import code (different project).

## Architecture Decisions

- **Pure client-side shell.** No new API routes, no server actions in 011. The chat
  surface is rendered as a child but its real wire (LLM call) belongs to 013.
- **Selection state lives in `AllocatorWorkspace`.** A single `useState` of
  `{ selectedOccurrenceId, selectedDate, activeTab }` is threaded down via props.
  No Context, no Zustand — Simplicity First, single parent, single consumer.
- **Tabs are a state-driven array, not routes.** No URL change on tab switch in V1
  (defer URL sync to a later pass; query-param sync is an obvious follow-up but is
  speculative now).
- **Shell first, content stub later.** 011 ships the tab nav and only renders the
  `Calendar` tab's real content (existing `CalendarView`). The other 5 tab labels
  appear in the nav but render a clearly-labelled placeholder pane ("Not yet
  implemented — see 013"). This lets 011 land independently and not block on 012/013.
- **Mobile: two-option sticky switch.** At `<md`, show a single segmented control
  (`Chat | Workspace`) sticky at the top; mounting only the active panel below it.
  At `md+`, both panels are visible side-by-side via the WindowLayout pattern.
- **`AppHeader` is operational, not marketing.** Product name, member label
  (placeholder `Member: demo`), schedule window, last-generated/imported state
  indicator. No marketing copy, no nav links, no logo brand work.

## Proposed Component Tree

```
src/app/page.tsx
  └── <AllocatorWorkspace
         result={result}
         activities={activities}
         availability={availability}
       />
src/components/workspace/
  AllocatorWorkspace.tsx     # 'use client'; owns selection + activeTab + viewport split
  AppHeader.tsx              # name | member | window | last-generated indicator
  WindowLayout.tsx           # left/right panels at md+, mobile single-panel
  MobileSwitch.tsx           # 'Chat' | 'Workspace' segmented control at <md
  ChatSurface.tsx            # left panel skeleton (composer + scroll area); body comes in 013
  WorkspacePanel.tsx         # right panel: tab nav + active-tab content
  TabNav.tsx                 # horizontal tab buttons; one prop = activeTab + onSelect
  tabs/
    CalendarTab.tsx          # wraps existing CalendarView
    ActionListTab.tsx        # 011 stub: 'Not yet implemented (013)'
    PriorityQueueTab.tsx     # 011 stub
    ResourcesTab.tsx         # 011 stub
    AllocationTraceTab.tsx   # 011 stub
    DataImportTab.tsx        # wraps existing ImportPanel
```

`src/components/CalendarView.tsx`, `ImportPanel.tsx`, and the other existing components
remain in place. 011 does NOT modify them beyond the prop interfaces they already expose.

## Shared Selection Model

```ts
interface WorkspaceSelection {
  selectedOccurrenceId: string | null;  // occ-<sourceActivityId>-<date>
  selectedDate: string | null;          // YYYY-MM-DD, may be set without a specific occurrence
  activeTab: TabId;
}
type TabId = 'calendar' | 'actions' | 'priority' | 'resources' | 'trace' | 'data';
```

`AllocatorWorkspace` owns the `useState<WorkspaceSelection>` and threads a `select`
function down. Calendar chips, agenda rows, and later (013) action/priority/resource
rows + chat answer links all call `select({ selectedOccurrenceId, selectedDate, activeTab })`.

## Tasks

1. **Inventory reference patterns** → *verify:* Read `window-layout.tsx` + `chat.tsx`
   from `/Users/duyvt6663/github/app/`; capture the class shapes you'll mirror in a
   short comment header at the top of each new file you write.
2. **Create `src/components/workspace/` directory** and the file shells above.
   → *verify:* `tsc --noEmit` passes (no broken imports), components render `null` or
   trivially.
3. **Implement `AllocatorWorkspace.tsx`** — `'use client'`; owns selection state +
   `useMediaQuery` (or CSS-only) viewport split. Props: `{ result, activities,
   availability }`. → *verify:* renders both panels at desktop width; renders one at
   mobile width with the switch.
4. **Implement `AppHeader.tsx`** — props `{ result }`. Renders product name "Elyx
   Resource Allocator", `Member: demo`, window range, count badges (delegate to existing
   `SummaryHeader` or reuse its logic — pick one path). → *verify:* visible at top of
   every viewport; counts match `result.occurrences` totals.
5. **Implement `WindowLayout.tsx`** — props `{ left, right }`. Renders a 2-col flex/grid
   at `md+`. Sticky divider; left panel `w-2/5`/`md:max-w-md`, right panel fills.
   → *verify:* at 1280px the two panels are visible side-by-side; at 360px only one
   panel is mounted (controlled by parent).
6. **Implement `MobileSwitch.tsx`** — props `{ value: 'chat'|'workspace';
   onChange: (v) => void }`. Sticky `top-0 z-10` segmented control.
   → *verify:* tapping switches `AllocatorWorkspace`'s shown panel; sticks on scroll.
7. **Implement `ChatSurface.tsx`** — 011 SKELETON only:
   - Header row: `Allocator Assistant` label.
   - Empty scrollable message area.
   - Bottom-pinned `<textarea>` composer + Send button (disabled or wired to a noop
     `console.log('TODO 013: real LLM call')` for now).
   - A bottom fade ([gradient mask] over the scroll area).
   *Decision Recap should explicitly note* "real LLM provider wiring is 013's job".
   → *verify:* visible chat shell renders at all viewport widths; composer focusable.
8. **Implement `WorkspacePanel.tsx` + `TabNav.tsx`** — tab buttons in order:
   Calendar, Actions, Priority, Resources, Trace, Data. Active tab gets the locked
   color scheme (dark `bg-gray-900 text-white`). Renders the active tab's component.
   → *verify:* clicking each tab switches the visible pane; the selected tab persists
   to `AllocatorWorkspace.selection.activeTab`.
9. **Implement `tabs/CalendarTab.tsx`** — wraps existing `<CalendarView result={result} />`.
   Also subscribes to the selection model so clicking a chip in CalendarView sets
   `selectedOccurrenceId + selectedDate`. *Note:* threading selection INTO CalendarView
   requires extending its prop interface (`onSelect?: (sel) => void`); do this minimal
   extension without rewriting CalendarView. → *verify:* clicking a chip in the calendar
   updates the selection state (visible in a small debug overlay during dev, removed
   before final).
10. **Implement `tabs/DataImportTab.tsx`** — wraps existing `<ImportPanel
    fallbackResult={result} fallbackActivities={activities}
    fallbackAvailability={availability} />`. → *verify:* the Data tab renders import
    controls; uploading a malformed JSON shows the existing validation errors;
    Rerun + Reset still work end-to-end.
11. **Implement the 4 stub tabs** (`ActionListTab`, `PriorityQueueTab`, `ResourcesTab`,
    `AllocationTraceTab`) as plain panels: `<div className="p-6 text-gray-500">Not yet
    implemented — see backlog 013.</div>`. → *verify:* the tab nav is complete and
    clicking each stub tab shows the placeholder, not an error.
12. **Rewrite `src/app/page.tsx`** — now imports `AllocatorWorkspace` instead of
    `CalendarView` directly. Preserves the existing top-of-file `DECISION RECAP` and
    adds a note that 011 replaces the V1 single-calendar route. → *verify:*
    `npm run build` passes; `/` still prerenders as `○ (Static)`.
13. **Add Playwright smoke** (`drive-011.mjs` or extend the existing driver): at
    1280px see both panels; click each tab; click a chip → selection updates; resize
    to 360px → mobile switch appears; toggle to Chat → composer focusable; toggle back
    to Workspace → active tab persists. → *verify:* zero `pageerror` / `console.error`;
    smoke saves shots to `/tmp/elyx-011-shots/`.

## Open Questions / Decisions Needed

1. **Selection model: `useState` vs Context vs URL search params.** *Recommended:*
   plain `useState` lifted to `AllocatorWorkspace` (Simplicity First; one consumer
   tree). Revisit only if a deeper component needs selection without prop drilling
   (Context) or if the user wants shareable links (URL params).
2. **Viewport split: media-query JS vs CSS-only `hidden md:block`.** *Recommended:*
   CSS-only — keeps SSR pure and avoids hydration mismatch. Mobile-switch state is
   client-side `useState`.
3. **Does CalendarView already accept an `onSelect` prop?** *No;* extend its prop
   interface minimally. Don't refactor CalendarView's internals.
4. **Should the AppHeader subsume `SummaryHeader`?** *Recommended:* keep `SummaryHeader`
   inside the Calendar tab (existing position); AppHeader shows the bare facts (name,
   member, window). Avoids count duplication.

## Dependencies & Interfaces (what 011 provides to others)

- **To 012:** no direct dependency. 012 produces `ScheduleDiagnostics` independently;
  011's `AllocationTraceTab` stub doesn't read diagnostics yet.
- **To 013:**
  - `ChatSurface.tsx` exposes a stable shell + composer; 013 fills its `onSend(text)`
    with the real LLM call.
  - Selection model + `select(...)` API — 013's chat answers can `select(...)` to
    jump the workspace into the relevant tab.
  - 4 stub tabs in `tabs/` — 013 replaces each placeholder with real content.

## Verification

- `npm run build` exits 0 after 011 lands; `/` is `○ (Static)`.
- `npm test` still passes (no scheduler changes).
- At 1280px viewport: AppHeader visible at top; ChatSurface on left; WorkspacePanel
  with 6-tab nav on right; Calendar tab active by default and rendering the existing
  calendar.
- At 360px viewport: AppHeader visible; MobileSwitch sticky at top; only one of
  {ChatSurface, WorkspacePanel} mounted at a time; tab persists across switch toggles.
- Selection round-trip: click a chip → `selectedOccurrenceId` updates; visible in dev
  debug; resize doesn't lose the selection.
- ImportPanel reachable through `Data` tab; validation errors still render inline.
- Zero `pageerror` / `console.error` events in the Playwright smoke.

## What 011 deliberately does NOT do

- Implement the 6 tabs' real content (deferred to 013).
- Wire a real chat LLM call (013).
- Define `AllocationTrace` or extend scheduler output (012).
- Add URL-param sync for selection or active tab.
- Add a real product logo / member-switch UI (still placeholder `Member: demo`).
