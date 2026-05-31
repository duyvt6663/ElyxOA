# 022 - UI/UX polish (chat formatting, tooltips, tour interactivity)

## Source

A UI/UX verification loop on the deployed app (2026-06-01), driving the real UI and capturing each
gap. Four issues were flagged by the reviewer; this doc verifies each with evidence + root cause +
proposed fix, and adds a few adjacent gaps found during the pass.

Severity: **P1** = hurts the core demo / first impression; **P2** = noticeable; **P3** = minor polish.

---

## G1 [P1] Glossary tooltip is clipped by the tab bar / header

**Observed.** Opening the `Scheduled · 3318` summary-pill tooltip shows only its bottom sliver
("…calendar as planned.") peeking out below the tab nav; the label + most of the explanation are cut
off above. Any tooltip whose trigger sits near the top of the workspace scroll area is affected (top
calendar-row `B`/`X` markers, the summary pills).

**Root cause.** `GlossaryTooltip` positions the popover with `absolute bottom-full left-0` — always
*above* the trigger — inside the workspace's scrolling/overflow container. For a top-of-container
trigger the popover overflows upward and is clipped by the container and overlapped by the (sticky)
`TabNav`.

**Proposed fix.** Make the popover escape the clip and flip when there's no room above:
- Render it in a **portal to `document.body`** with `position: fixed`, computing the trigger rect.
- **Collision-aware placement:** open *below* the trigger when the space above is smaller than the
  popover (and clamp horizontally to the viewport).
- Keep z above the header.

Files: `src/components/GlossaryTooltip.tsx`.

---

## G2 [P1] Streamed chat text is not formatted, and citations are dead raw ids

**Observed (prose response capture).**
> During the Singapore trip (travel-01, 2026-06-22 to 2026-06-29), several morning workouts were
> substituted with `**Remote Brisk Walk Fallback**` (occ-act-103-2026-06-22 at 08:00–09:00 …) …

Two distinct problems:

- **G2a — markdown is rendered literally.** The model emits `**bold**`, lists, etc., but the bubble
  renders text as plain `whitespace-pre-wrap`, so users literally see the `**` asterisks. Looks broken.
- **G2b — occurrence-id citations are raw, inline, and not clickable.** `occ-act-103-2026-06-22` strings
  clutter the prose and can't be clicked to open the Trace. The model was even *asked* to cite ids, so
  this is the common case, not an edge case.

**Proposed fix.**
- Render assistant text through a **lightweight markdown renderer** (bold/italic/lists/`code`/line
  breaks). Avoid a heavy dep if a small parser suffices; the existing markdown-link parsing folds in.
- Turn `occ-<activityId>-<YYYY-MM-DD>` tokens into **clickable citation chips** that
  `selectOccurrence` (open Trace) and display compactly (e.g. the activity title + short date, full id
  on hover) instead of the raw 25-char id mid-sentence. Reuse the nestable tooltip/`navActionToSelection`.

Files: `src/components/workspace/ChatSurface.tsx` (`renderMessageContent`), maybe a new
`src/components/workspace/AssistantMarkdown.tsx`.

---

## G3 [P2] The assistant sometimes returns only a navigation card, no answer

**Observed.** Asking "Why was this skipped, and where can I see the details?" produced *only* a
`↪ Show trace occ-act-003-2026-06-01` card — no prose explanation, even though the system prompt says
to answer in text alongside any tool call.

**Proposed fix.**
- Strengthen the system prompt: a navigation tool call must be **accompanied by** a 1–2 sentence answer;
  never navigate *instead of* answering an explanation question.
- Defensive UI: if an assistant turn has tool parts but no text part, render a short default line
  ("Opening the trace for …") so the bubble is never just a bare card.

Files: `src/lib/llm/prompt.ts`, `src/components/workspace/ChatSurface.tsx`.

---

## G4 [P1] Tour order is backwards (chat first instead of core features first)

**Observed / confirmed in code.** `tourSteps.ts` order is: **chat → calendar summary → calendar grid →
trace → tabs**. Opening with the assistant before the reviewer understands the calendar/allocation
story is unintuitive.

**Proposed fix.** Reorder to **main features first, chat last**, e.g.:
1. Calendar summary (plan → 3-month calendar, the counts)
2. Adaptations on the grid (✈ travel, B/X)
3. Trace (explainability)
4. Activities / Resources (priority vs outcome, availability)
5. **Chat last** (ask why, navigate, and propose an edit) — now the reviewer has context for it.

Files: `src/components/workspace/tourSteps.ts`.

---

## G5 [P1] The tour is passive — let the user *do* the step

**Observed / confirmed in code.** `GuidedTour` draws a full-screen click blocker (`fixed inset-0`), so
the spotlighted element is **not interactable** during the tour. The reviewer specifically wants:
- During the **glossary/tag** step, hovering a highlighted tag should actually open its tooltip.
- During the **chat** step, the user should be able to **pick a draft-edit chip and run it**, seeing
  the real preview → Apply result as the demo.

**Proposed fix.**
- Make the blocker a **spotlight cutout**: leave the highlighted target's rect interactive
  (pointer-events pass through the "hole") while the rest stays blocked — so hover/click on the
  spotlighted element works.
- Add an optional `interactive`/`waitFor` flag per step. For an interactive step the callout says
  "try it" and **Next** unlocks once the action happens (or stays manual).
- Add a dedicated **chat-demo step**: spotlight the "Try a schedule edit" chips, prompt the user to
  click one and Send, and let the draft preview/Apply play out inside the tour.

Files: `src/components/workspace/GuidedTour.tsx`, `tourSteps.ts`, `AllocatorWorkspace.tsx`.

---

## Adjacent gaps found during the pass

- **G6 [P3] Pin affordance** — context-chip pinned/unpinned is `📌`/`📍` (two similar emoji,
  inconsistent across platforms). Prefer a filled-vs-outline icon or a tint. (carried over from the
  earlier review)
- **G7 [P3] Empty-chat whitespace** — the starter chips sit at the top with a large blank gap above the
  composer; center or bottom-align the empty state.
- **G8 [P3] Applied draft card still reads "✓ Applied" after Undo** — defensible (it *was* applied,
  it's chat history) but can mislead; consider an "Applied (undone)" state.

## Suggested sequencing

P1s first, roughly independent: **G2** (chat formatting — biggest visible win) and **G1** (tooltip
portal) can go together; **G4** (reorder) is trivial; **G5** (interactive tour) is the largest and
depends on nothing. **G3** rides along with the prompt/render work in G2.

## Out of scope

Not a redesign — these are targeted fixes to the existing surfaces. No new scheduler behavior.
