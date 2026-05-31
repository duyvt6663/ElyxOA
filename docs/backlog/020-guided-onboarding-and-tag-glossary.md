# 020 - Guided onboarding and tag glossary

## Problem

The app now contains enough scheduler/debugging concepts that a first-time reviewer can get lost
before they understand the core story:

- `substituted`, `skipped`, `B`, `X`, `◷`, `← source`, bundle counts like `Morning meds ×4`, and
  occupied blocks are meaningful allocator concepts, but several appear as compact tags with little
  explanation.
- The workspace has five tabs plus chat. A reviewer can inspect the calendar, activities,
  resources, trace, and data import flows, but the app does not actively teach the intended path.
- The take-home demo needs one clear mental model: **a priority-ordered action plan is allocated into
  a longitudinal calendar, then adapted around availability/resource/travel conflicts with traceable
  reasons**.

## Goal

Add lightweight guidance that helps a new user understand the app while still letting the actual
workspace remain the first screen.

Two layers:

1. **Tag glossary/tooltips** for compact labels and status markers.
2. **Guided onboarding tour** with spotlight/focus arrows that points at key UI regions and explains
   what to do next as the user explores.

This is not a marketing page. It is in-product guidance for a dense operational tool.

## Review refinements (added 2026-06-01, after 019 shipped)

The plan below is solid on the glossary + tour mechanics. These refinements close gaps that matter
specifically for "a newcomer learns the **core features the assignment asks for**". The assignment's
core story is: *a priority-ordered action plan → a 3-month calendar → adapted around
availability/resource/travel conflicts → with traceable reasons*. The tour must make that legible fast.

### R1. Lead with a short "core story" path; make the 12 steps an optional deep-dive

The 12-step tour is good for completeness but is too long for the "under two minutes" success
criterion (~10s/step). Split it:

- **Core path (5 steps, ≤90s)** — the assignment story, in order:
  1. **Calendar summary** — "A priority-ordered plan becomes a 3-month schedule. These counts are the
     scheduled / substituted / skipped outcomes."
  2. **A day with adaptations** (anchor on a known travel/skip day — see R5) — "Open a day to see what
     the allocator changed and why."
  3. **Substituted / skipped row + the `← source` arrow** — "Backups fill in when the first choice
     can't be placed; skipped means nothing safe fit."
  4. **Trace** — "Every placement is explainable: candidates tried, constraints failed, final pick."
  5. **Chat** — "Ask why, navigate, or propose a schedule edit you preview before applying."
- **Deep-dive (the rest)** — Activities, Resources, Data, bundles, occupied blocks: reachable from the
  Help hub, not forced on first run.

### R2. 019 is SHIPPED — the tour + glossary must cover the agent, not just "chat context"

Step 12 ("attach context") under-sells what now exists. The chat is a contextual **agent**. Add tour
steps / glossary for the three shipped capabilities, because they're core differentiators a reviewer
should see:

| New step | Target | Message |
| --- | --- | --- |
| Navigation cards | a `↪` action card after asking "open the Resources tab" | "The assistant can drive the workspace — click a card to jump there." |
| Draft edits | the amber **Try a schedule edit** starter chips → a draft card | "Ask to move/block/reschedule. You get a preview (what changes, what gets skipped) and must **Apply** — nothing mutates silently." |
| Edited badge + undo | the header **Schedule edited · Reset to original** badge | "Applied edits rerun the real scheduler; undo or reset to the original anytime." |

### R3. Travel discovery — calendar marker now shipped; glossary it + still point the tour at Resources

Travel (the assignment's headline adaptation driver) is displayed in **Resources → "Travel (2)"**
(Singapore / Tokyo as bands with red "blocked" overlays) and indirectly via skipped/substituted pills +
the day-timeline `travel` occupied blocks.

**✅ Done (`4674cee`):** the calendar now also marks trip days with a small amber **✈ &lt;destination&gt;**
badge on every day inside a `TravelPlan.blocked` range (desktop `DayCell` + mobile `AgendaList`), so a
newcomer sees Jun 22–29 is a Singapore trip without the tour. Follow-ups for 020:

- Add a glossary entry for the **✈ travel badge** (and wrap it in `GlossaryTooltip`).
- The travel/adaptation tour step can now point at the calendar badge itself, then optionally open
  Resources → Travel for the full blocked-range view.

### R4. Glossary additions for the 019 vocabulary

Beyond `chat.contextBlock`, add: `chat.navigationCard` (`↪`), `chat.draftEdit` (Draft / Apply /
Discard), `chat.explainWhy` (deterministic skip explanation + "fewer skips in …" alternatives),
`chat.editedBadge` (Schedule edited / Reset), `chat.pinnedContext` (📌 survives navigation). Use the
same `GlossaryTooltip` so the chat surface is self-explaining.

### R5. Name the known demo anchors so steps find good examples deterministically

Per Phase 3's "query the result, don't hardcode" rule, but seed the search with the engineered demo
moments so a step never lands on a boring day: **Jun 1** (Cardiology Review skipped — resource demo),
**Jun 22–29** (Singapore travel — in-person actions substituted/skipped), **Jul 6–12** (treadmill
outage), **Aug 10–14** (Tokyo travel). The travel/adaptation step should prefer Jun 22; fall back to
the first day with any substituted/skipped occurrence.

### R6. Sequencing

019 is done and deployed, so 020 can reference the real shipped chat UI (`ChatActionCard`,
`DraftPatchPreview`, the edited badge, the `Try a schedule edit` chips). Build glossary tooltips
(Phase 1) + the core-path tour (R1) first — that alone satisfies success criteria 1–2.

### R7. Implementation status (2026-06-01)

**✅ Glossary (Phase 1) shipped** (`6a96249`, `cfc97db`): `ui-glossary.ts` (typed source of truth +
test), accessible `GlossaryTooltip` (hover/focus/tap, Escape, outside-tap, nestable inside row
buttons), wired into `SummaryHeader` status pills and the in-row tags `B`/`X`, the ✈ travel badge, and
DayTimeline `◷` / `← source`. **Skipped intentionally:** occupied-block bars (their `title` backs the
A3 acceptance assertion) and the bundle toggle (a tooltip there fights its expand click) — covered by
the tour instead.

**✅ Guided tour (Phases 2–3) shipped** (`de444d6`): the 5-step core-path tour (`tourSteps.ts` +
`GuidedTour.tsx`) with box-shadow spotlight + bottom-sheet callout, `prepare` tab/selection (selects a
real skipped/substituted occurrence per R5), a once-per-browser first-run nudge (localStorage), a
"? Take the tour" header control, and Back/Next/Skip/Finish. Verified: tour-verify 10/10, acceptance
A1–A6 still 6/6.

**✅ Help hub + chat vocabulary + acceptance shipped** (`5eeb7f6`): `HelpPanel` (dismissible modal —
"Take the tour" + the full glossary, no API key needed) reachable from a header "? Help" control;
glossary entries for the chat vocabulary (R4: nav card, draft edit, edited badge, pinned context, chat
context) with inline tooltips on the ChatActionCard `↪` and the DraftPatchPreview "Draft edit" header;
and acceptance **A7** (glossary tooltip), **A8** (tour first-run → 5 steps → Finish → localStorage),
**A9** (Help panel) folded into `tests/drive-acceptance.mjs` (now **A1–A9 9/9**).

**020 is functionally complete.** Optional future polish: wrapping the pinned-context chip / context
block inline (currently glossary-only to avoid fighting the chip's pin/remove buttons), and per-tab
contextual first-open hints. Everything in the success criteria is met.

## Design decisions

1. **Central glossary, reused everywhere.** Define tag meanings once and reuse them in
   `SummaryHeader`, `Legend`, `OccurrenceCard`, `DayTimeline`, `AgendaList`, Activities, Resources,
   Trace, and Chat context UI.
2. **Accessible tooltips, not only `title`.** Native `title` is insufficient for keyboard and mobile.
   Tooltips/popovers must open on hover, focus, and tap/click, and expose `aria-describedby` or an
   equivalent accessible label.
3. **Guidance is optional and dismissible.** Show first-run guidance once per browser via
   `localStorage`; provide a persistent small Help/Tour control in the header to restart it.
4. **Tour steps act on the real app.** The tour should highlight actual controls, switch tabs when
   needed, and select a demo day/occurrence when the next step needs context. Do not use screenshots
   or a fake demo page.
5. **Small custom implementation first.** Avoid a new dependency unless positioning/focus management
   becomes too complex. A focused `GuidedTour` component with `data-tour-id` targets is enough for
   this codebase.
6. **Do not permanently clutter the UI.** Explanatory text should live inside tooltips, popovers, and
   the tour. The normal app remains compact after onboarding is dismissed.

## Tag glossary

Add a glossary map, for example `src/lib/ui-glossary.ts`:

```ts
type GlossaryKey =
  | 'status.scheduled'
  | 'status.substituted'
  | 'status.skipped'
  | 'statusGlyph.B'
  | 'statusGlyph.X'
  | 'time.outsidePreferredWindow'
  | 'bundle.display'
  | 'timeline.occupiedBlock'
  | 'timeline.substitutionArrow'
  | 'trace.score'
  | 'trace.policySource'
  | 'resource.blocked'
  | 'chat.contextBlock';
```

Initial definitions:

| Key | Label | Explanation |
| --- | --- | --- |
| `status.scheduled` | Scheduled | The original action was placed on the calendar as planned. |
| `status.substituted` | Substituted | The original action could not be placed, so a backup/fallback action was scheduled instead. |
| `status.skipped` | Skipped | Neither the original action nor an eligible backup could be placed for that date. |
| `statusGlyph.B` | B | Backup used: this day/type includes substituted actions. |
| `statusGlyph.X` | X | Not placed: this day/type includes skipped actions. |
| `time.outsidePreferredWindow` | Outside preferred window | The action was scheduled outside its ideal time window because constraints made a better slot unavailable. |
| `bundle.display` | Routine bundle | Several low-risk daily food/medication actions are grouped for readability; expanding shows the individual actions. |
| `timeline.occupiedBlock` | Occupied block | Time already taken by sleep, work, commute, meals, travel, or personal commitments. |
| `timeline.substitutionArrow` | Fallback arrow | The item on the left is what was scheduled; the item after the arrow is the original requested action. |
| `trace.score` | Score | A lower scheduler score means a candidate slot better matched timing/resource preferences. |
| `trace.policySource` | Policy source | Whether the timing policy came from explicit fixture data, deterministic defaults, or generated semantic hints. |
| `resource.blocked` | Blocked window | Dates where a required resource, specialist, or travel constraint prevents the original action. |
| `chat.contextBlock` | Chat context | A selected schedule object that will be included in the next assistant turn. |

### Tooltip component

Add a small reusable component:

```tsx
<GlossaryTooltip term="status.substituted">
  <span className="...">substituted</span>
</GlossaryTooltip>
```

Behavior:

- Hover/focus opens a compact popover.
- Tap/click toggles it on touch devices.
- Escape closes it.
- Tooltip content must not shift layout.
- If used inside a button row, it must not break the parent row's click target.

## Guided onboarding

### Entry points

- First visit: show a small non-blocking prompt, "Take a 90-second tour", with Start and Skip.
- Header Help control: restart tour, open glossary, and optionally show keyboard shortcuts later.
- Contextual triggers: when the user first opens Trace or Data, show a one-step hint for that tab if
  the main tour has not already covered it.

### Tour mechanics

Use `data-tour-id` attributes on stable targets:

```tsx
<section data-tour-id="calendar-summary">...</section>
<button data-tour-id="calendar-day-demo">...</button>
<section data-tour-id="day-timeline">...</section>
<nav data-tour-id="workspace-tabs">...</nav>
```

`GuidedTour` responsibilities:

1. Track `stepIndex`, `active`, and `completed` in workspace state.
2. Persist completion in `localStorage` under a versioned key such as
   `elyx-guided-tour-v1-complete`.
3. Before each step, run an optional `prepare()` callback to switch tabs, select a date, or select a
   known occurrence.
4. Scroll the target into view.
5. Draw a translucent page overlay, a highlight ring around the target, and an arrow/callout.
6. Provide Back, Next, Skip, and Finish controls.
7. On mobile, use a bottom-sheet callout instead of trying to position a desktop-style bubble.

### Proposed tour steps

| Step | Target | Prepare action | Message |
| --- | --- | --- | --- |
| 1 | Chat panel | none | "Ask why something moved, what changed during travel, or what constraints shaped the schedule." |
| 2 | Calendar summary | open Calendar | "The allocator turns the action plan into a 3-month schedule. These counts summarize scheduled, substituted, and skipped outcomes." |
| 3 | Status tags / legend | open Calendar | "`Substituted` means the backup action was used. `Skipped` means no safe/feasible action fit." |
| 4 | Demo travel day | select `2026-06-22` | "Travel and resource constraints force visible adaptations. Open a day to see what changed." |
| 5 | Day timeline | select `2026-06-22` | "Occupied blocks and health actions share the same day view, so you can see why timing matters." |
| 6 | Routine bundle | select a day with `displayBundleLabel` | "Bundles keep repetitive food/medication routines readable; expand one to inspect the raw actions." |
| 7 | Substituted row | select a day with substituted actions | "Fallback rows show what was scheduled and what original action it replaced." |
| 8 | Trace tab | select a substituted/skipped occurrence and open Trace | "Trace explains the allocation attempt: candidates tried, constraints failed, and final decision." |
| 9 | Activities tab | open Activities | "Activities combines action definitions and allocation outcomes, so priority and result can be compared." |
| 10 | Resources tab | open Resources | "Resources shows the equipment/specialist/travel availability that drives conflicts." |
| 11 | Data tab | open Data | "Import alternate activities or availability to rerun the allocator locally without a backend." |
| 12 | Chat context (after 019) | focus chat context tray | "Selected schedule objects can be attached to chat so the assistant answers about the exact day/action/slot." |

Keep the copy short. Each step should teach one concept and include at most one action.

## Implementation tasks

### Phase 1 - Glossary tooltips

Scope:

- Add `ui-glossary.ts` glossary definitions.
- Add `GlossaryTooltip` component.
- Wrap status badges in `SummaryHeader`, `Legend`, and `OccurrenceCard`.
- Add explanations for `B`/`X` count markers in `AgendaList` and month/day summaries.
- Add explanations for `◷`, `← source`, occupied blocks, and routine bundles in `DayTimeline`.

Verification:

- Hovering/focusing/tapping `substituted` explains backup/fallback substitution.
- `B` and `X` markers explain backup-used and skipped counts.
- Tooltips work with keyboard focus and do not block selecting occurrence rows.

### Phase 2 - Tour shell

Scope:

- Add `GuidedTour` and `TourProvider` or keep tour state in `AllocatorWorkspace` if simpler.
- Add stable `data-tour-id` attributes to target surfaces.
- Add a Help/Tour button in `AppHeader`.
- Persist dismiss/completion in `localStorage`.
- Support desktop spotlight callouts and mobile bottom-sheet callouts.

Verification:

- First visit shows a Start/Skip prompt.
- Skip persists across reload.
- Restart tour from header works.
- Tour can move across Calendar, Trace, Activities, Resources, and Data tabs.

### Phase 3 - Contextual step preparation

Scope:

- Add per-step `prepare()` callbacks that call existing selection/tab handlers.
- Select a known demo date (`2026-06-22`) for travel/adaptation steps.
- Select a known substituted/skipped occurrence by querying the current result, not by hardcoding a
  brittle occurrence id.
- If no suitable occurrence exists after an imported schedule, gracefully skip that step or show a
  generic explanation.

Verification:

- The travel/adaptation step finds a substituted or skipped example in the currently displayed result.
- After importing alternate data, the tour still runs without throwing.
- Mobile tab switching during the tour brings the workspace pane forward when needed.

### Phase 4 - Help hub

Scope:

- Add a small Help panel reachable from the header.
- Include "Restart tour", "Open glossary", and links to the most important explanations:
  status outcomes, calendar density, trace, resources, import, and chat context.
- Optionally add "Ask chat about this" buttons after 019 is stable.

Verification:

- A user can rediscover explanations after dismissing onboarding.
- Help panel does not depend on `OPENAI_API_KEY`.

## Copy guidelines

- Use product language, not implementation language, in the UI.
- Prefer "backup action" over "substituted occurrence" in first-run explanations.
- Explain why the user should care: "This tells you why the calendar changed", not only "This is a
  status."
- Keep every tour callout to 1-2 short sentences.
- Tooltips can be slightly more precise because users request them intentionally.

## Accessibility and UX details

- Tour callout must trap focus only while active; Skip/Next must be reachable by keyboard.
- Escape closes the active tooltip or skips the tour prompt.
- Tooltip content should be readable at mobile widths; avoid hover-only behavior.
- Respect `prefers-reduced-motion`; use instant positioning instead of animated zoom if enabled.
- Do not cover the target with the callout. If there is no safe placement, use a bottom-sheet callout.

## What this is not

- Not a separate landing page.
- Not a long tutorial that blocks app usage.
- Not a replacement for Trace or chat explanations.
- Not a new scheduler feature.

## Testing and acceptance

Playwright:

- **A11** - First visit shows Start/Skip; Skip persists after reload.
- **A12** - Restart tour from Help moves through at least Calendar → Day timeline → Trace.
- **A13** - `substituted`, `B`, `X`, `◷`, and occupied-block tooltips open on focus and contain the
  expected explanation.
- **A14** - Mobile tour uses bottom-sheet callouts and does not hide the highlighted target.

Vitest:

- Glossary contains definitions for every referenced key.
- Tour step registry validates that every step has a target id and short copy.

## Success criteria

1. A first-time reviewer can understand scheduled/substituted/skipped without reading docs.
2. The app can guide the reviewer through the main demo story in under two minutes.
3. Tooltips explain compact tags without adding permanent clutter.
4. Guidance works without an API key.
5. The tour remains stable after importing alternate data or changing filters.
