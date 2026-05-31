# 017 - Merge the Actions + Priority tabs into one "Activities" tab

## Goal
The workspace has SIX right-panel tabs: Calendar, **Actions**, **Priority**, Resources, Trace,
Data. Actions and Priority are two views of the *same list* — every primary activity — and they
overlap heavily. The 013 plan flagged this as an open question; 016's review confirmed it (Actions
reads as a raw definition dump, Priority as the outcome view). This plan merges them into a single
**Activities** tab with a view/sort toggle, dropping the tab count 6 → 5 and removing the redundant
surface.

## Why merge (evidence)
- **Same rows.** Both render `activities.filter(a => !a.isBackupOnly)` — one list, sorted differently.
- **Complementary columns, no conflict.**
  - `ActionListTab`: definition columns (id, title, type, freq, priority, resources) + the **outcome
    (S·B·X)** column (added in 016 §E) + row-expand to occurrences (date+status → Trace) + the
    definition metadata (facilitator/locations/remote/prep/backups) in the expansion.
  - `PriorityQueueTab`: priority-sorted rows + a stacked **outcome bar** + `off-window` count +
    row click → first occurrence's Trace.
  - The union is one row shape: `[pri] [type] title  [outcome bar + S·B·X + off-win]  [resources]`,
    expandable to occurrences + definition.
- **Reviewer cost.** Two tabs that answer "what's in the plan and how did each fare?" is one tab's
  worth of information split in two; a reviewer toggles between them to assemble the full picture.

## Design (the merged "Activities" tab)

> **Spec pass (post-review 2026-05-31).** Resolves the ambiguities a reviewer flagged so this is
> implementation-ready.

### One view, sort-only (decision #1)
There is **one merged view**, not separate Compact/Detailed/Outcome display modes. The "toggle" is
purely a **sort control** over a single row layout. (Density differences are handled by row-expand,
not by a mode switch.)

### Row layout
One row per primary activity:
`priority · type tag · title · outcome bar (green/amber/gray) · S·B·X + off-window · resources`.
(Outcome bar from Priority; S·B·X + resources from Actions; off-window from the scheduler-emitted
`outsidePreferredWindow` flag.)

### Sort modes + EXACT ordering (decision #2)
Default **Priority**. Every mode ends with the same deterministic tie-break: **priority asc, then
`activity.id` asc**.
- **Priority** — `priority` asc. (priority is unique, so the tie-break never triggers.)
- **Type** — fixed domain order `consultation → therapy → fitness → food → medication` (matches the
  calendar's TYPE_ORDER), then tie-break.
- **Outcome (most adapted first)** — descending by the lexical key `(skipped, substituted,
  offWindow)`: most-skipped first, then most-substituted, then most-off-window, then tie-break. (X
  weighted over B over off-window, as the review suggested — no fragile single score.)
- **Frequency** — descending by `count × {day:365, week:52, month:12, year:1}` (the current Actions
  weighting), then tie-break.

### Hit targets — NO whole-row onClick (decision #3)
The row is a flex container of explicit buttons (no nested-button-in-onClick):
- **chevron + title** button → toggles inline expand.
- **outcome** area (bar + S·B·X) button → jumps to the representative occurrence's Trace.
- **occurrence** buttons inside the expansion → Trace for that specific occurrence.

### Which occurrence the outcome click opens (decision #4)
Not "first chronological" (boring). Pick the most explainable: **first skipped, else first
substituted, else first `outsidePreferredWindow`, else first scheduled** (a
`pickRepresentativeOccurrence(occs)` helper). Falls back to nothing if the activity has no
occurrences.

### Row expand content
The activity's occurrences (date + status chip → Trace) PLUS the definition metadata line
(facilitator, locations, remote, prep count, backups). Sticky table header on desktop.

### Mobile layout (decision #5)
At `<md` the table collapses to **stacked cards**, not a squeezed 7-column table:
- line 1: `priority · type · title`
- line 2: outcome bar + `S·B·X` (+ off-window)
- resources + definition metadata appear **only in the expansion**.

### Naming
Label the tab **Activities**. Tab order becomes Calendar · Activities · Resources · Trace · Data
(5 tabs) — also eases the 016 §9 mobile tab-strip width.

## Implementation tasks
1. **Rename** `ActionListTab.tsx` → `tabs/ActivitiesTab.tsx` (its table/expand/sticky-header +
   outcome column are the better base), fold in `PriorityQueueTab`'s outcome **bar** + off-window +
   the sort modes above, then **delete `PriorityQueueTab.tsx`**. (Do NOT create a third temporary
   component.) One memoized `outcome` map (already in ActionListTab) feeds both the bar and S·B·X.
2. `AllocatorWorkspace`: `TabId` `'actions' | 'priority'` → single `'activities'`; default tab order
   updated. `WorkspacePanel.renderTab` routes `'activities'` → `ActivitiesTab`. `TabNav` TABS list
   drops two entries, adds one.
3. **Update STATIC COPY that names the old tabs** (not just link parsing):
   - `ChatSurface` starter tooltip ("…Calendar/Priority/Resources tab first") → "…Calendar/
     Activities/Resources tab first".
   - `AllocationTraceTab` empty-state guide ("Click any row in the **Priority** tab") → "Activities".
   - System prompt link vocabulary **confirmed clean**: emits only `trace://occ-…`,
     `tab://calendar?date=…`, `tab://resources` — no `actions`/`priority` links to change.
   - (Optional) internal comment in `ImportPanel.tsx` mentions "Priority/Resources/Trace tabs" —
     non-user-facing; update opportunistically, not blocking.
4. Update `tests/drive-acceptance.mjs`: selectors `getByRole('button',{name:/^Priority$/})` /
   `/^Actions$/` → `/^Activities$/`.
5. Docs: update `docs/context/index.md` §4 component list + tab inventory; archive this plan.

## Decisions (resolved post-review)
- **Single view, sort-only** — no display-mode switch (decision #1).
- **Keep both click affordances** as separate buttons (expand vs jump-to-Trace) — explicit hit
  targets, no whole-row onClick (decision #3).
- **Default sort = Priority**; exact ordering + deterministic tie-break (priority asc, id asc) per
  the Sort spec above (decision #2).
- **Outcome click → representative occurrence** (skipped → substituted → off-window → scheduled),
  not chronological first (decision #4).
- **Mobile = stacked cards**, not a squeezed table (decision #5).
- **Tab label "Activities"**; **rename + delete**, no third component.
- Out of scope: editing activities (still read-only), virtualization (102 rows render fine).

## Verification
- **Tab inventory:** nav shows exactly 5 tabs (Calendar · Activities · Resources · Trace · Data);
  **no "Actions" or "Priority" tab present**; no dead `actions`/`priority` `TabId`s remain.
- **List:** the Activities tab lists all 102 primary activities.
- **Sort:** each mode (Priority / Type / Outcome / Frequency) reorders deterministically (same input
  → same order), tie-broken by priority then id.
- **Row interactions:** chevron/title expands inline; the **outcome** button opens the representative
  occurrence's Trace (assert a skipped activity opens its skipped occurrence, not a scheduled one);
  an occurrence button in the expansion opens that occurrence's Trace.
- **Mobile (360px):** rows render as stacked cards (title/type/priority line + outcome line);
  metadata only on expand.
- **Static copy:** ChatSurface tooltip + Trace empty-state say "Activities", not "Priority".
- `npm test` + acceptance suite green; 0 console errors.
