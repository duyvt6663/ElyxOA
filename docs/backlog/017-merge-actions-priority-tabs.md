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
- **One row per primary activity**, columns:
  `priority · type tag · title · outcome bar (green/amber/gray) · S·B·X + off-window · resources`.
  (Outcome bar from Priority; S·B·X + resources from Actions; off-window from the scheduler flag.)
- **Sort control** (replaces Priority's implicit priority-sort + Actions' sort select):
  `Priority` (default) · `Type` · `Outcome (most adapted first)` · `Frequency`.
- **Row expand** (from Actions): the activity's occurrences (date + status chip, click → Trace) PLUS
  the definition metadata line (facilitator, locations, remote, prep count, backups). Sticky header.
- **Row click vs expand:** click the outcome area → jump to the first occurrence's Trace (Priority's
  behavior); click the row chevron/title → expand inline (Actions' behavior). Keep both affordances.
- **Naming:** label the tab **Activities**. Tab order becomes Calendar · Activities · Resources ·
  Trace · Data (5 tabs) — also eases the 016 §9 mobile tab-strip width.

## Implementation tasks
1. New `tabs/ActivitiesTab.tsx` = `PriorityQueueTab`'s outcome bar + off-window, merged with
   `ActionListTab`'s table/expand/sticky-header. Reuse both components' existing memoized counts
   (`outcome` map already exists in ActionListTab; Priority computes the same — share one).
2. `AllocatorWorkspace`: `TabId` `'actions' | 'priority'` → single `'activities'`; default tab order
   updated. `WorkspacePanel.renderTab` routes `'activities'` → `ActivitiesTab`. `TabNav` TABS list
   drops two entries, adds one.
3. Update chat link parsing / `select()` targets if any reference `activeTab: 'actions' | 'priority'`
   (grep: none currently emit those, but verify the system prompt's link vocabulary).
4. Delete `ActionListTab.tsx` + `PriorityQueueTab.tsx` after the merge (or keep one as the basis).
5. Update `tests/drive-acceptance.mjs` (no case currently targets Actions/Priority by name, but A-row
   selectors that use `getByRole('button',{name:/^Priority$/})` must change to `Activities`).
6. Docs: update `docs/context/index.md` §4 component list + tab inventory.

## Decisions / open questions
- **Keep both click affordances** (expand vs jump-to-Trace) rather than picking one — they serve
  different intents and the row has room. *Recommended default: yes.*
- **Default sort = Priority** (the priority-ordered plan is the assignment's framing). *Recommended.*
- **Tab label** "Activities" vs "Plan". *Recommended: "Activities"* (matches the data and the 013
  vocabulary).
- Out of scope: editing activities (still read-only), virtualization (102 rows render fine).

## Verification
- The merged tab lists all 102 primary activities; sort toggle reorders deterministically.
- Each row shows the outcome bar + S·B·X + off-window + resources; expand reveals occurrences
  (click → Trace) + the definition metadata.
- Tab nav shows 5 tabs (Calendar · Activities · Resources · Trace · Data); no dead `actions`/
  `priority` tab ids remain. Acceptance suite + `npm test` green; 0 console errors.
