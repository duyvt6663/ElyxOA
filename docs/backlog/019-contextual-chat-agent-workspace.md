# 019 - Contextual chat agent workspace

> **Status (2026-06-01):** Phases 1–3 shipped, deployed, and verified live (visible typed context +
> `@`-mentions, tool-call navigation cards, and validated draft schedule/travel edits with
> preview/Apply/undo). Phase 4 (ergonomics) is partly landed; the rest is planned. See
> [Implementation phases](#implementation-phases) for per-phase status and deviations.

## Web review
Reviewed the live app at `https://elyx-oa.vercel.app/` on 2026-05-31.

Current chat is useful as a Q&A/explainability surface, but not yet a workspace agent:

1. **Context is implicit.** The app sends `selectedOccurrenceId` and `selectedDate` to
   `/api/chat`, but the composer does not show a visible context block. A user cannot tell
   whether a selected action, day, bundle, or time range is included in the next prompt.
2. **No `@` insertion model.** The user can type free text or click starter chips, but cannot
   inject structured schedule context the way Cursor/Claude CLI inject files or symbols.
3. **Navigation is narrow.** Assistant links currently support only Trace, Calendar date, and
   Resources. There is no general action protocol for opening an activity, selecting a bundle,
   focusing an occupied block, changing filters, or jumping to a travel window.
4. **No draft modification loop.** Chat cannot propose a calendar/travel edit, preview the
   schedule delta, validate it against the deterministic scheduler, or ask the user to apply it.
5. **Grounding is still selection-first.** `buildGrounding()` resolves one selected occurrence,
   nearby occupied blocks, day bundles, and schedule-wide adaptations. That is a good base, but
   it needs a first-class multi-context model before chat can reason about "this slot", "that
   trip", and "these actions" together.

## Goal
Make chat the primary contextual command surface for the allocator workspace, not just a QA
tool. The user should be able to attach schedule objects to a prompt, ask for explanations,
navigate the right-side tabs, and request safe schedule/travel adjustments with previewed,
validated changes.

The guiding interaction should feel like:

```
@this-slot why did you place @MorningMeds here instead of after breakfast?
move @RemoteBriskWalk on Jun 22 to a hotel-gym slot if safe
show conflicts between @SingaporeTrip and @VO2MaxPrimer
block @Aug12 19:00-21:00 for dinner and reschedule affected actions
```

## Core decisions

1. **Visible context beats hidden context.** Anything sent as structured context must appear as
   a removable rectangular context block above or inside the chat composer.
2. **Context references are typed.** Chat should not receive arbitrary labels only. It receives
   typed refs such as `occurrence`, `activity`, `day`, `timeBlock`, `busyBlock`, `bundle`,
   `resource`, `travelWindow`, `trace`, or `scheduleRange`.
3. **The LLM proposes; deterministic code validates.** The assistant can parse intent and draft
   changes, but `scheduleTemporal()`, validation guards, and local patch application decide what
   is actually feasible.
4. **Edits are input edits, not output edits.** `scheduleTemporal(activities, availability, hints)`
   is a pure function that re-derives every placement from policy on each run — it has no "pinned
   occurrence" concept. So a draft edit must change an **input** (availability, travel, or an
   activity's temporal policy/hint) and let the rerun derive the rest. Edits that try to pin a
   single occurrence to a slot (`moveOccurrence`) or override scheduler-emitted output
   (`setDisplayBundle`) do **not** compose with a rerun and are treated as a separate, lower-priority
   class — see [Patch composability](#patch-composability). This keeps decision 3 honest: there is no
   override path that bypasses `isFeasible`.
5. **No silent mutations.** Navigation actions can happen directly after a user click. Schedule,
   availability, activity, or travel edits must be shown as a draft change card with an explicit
   Apply button.
6. **Structured actions come from the model's tool-call channel, not in-band JSON.** Assistant
   navigation and draft-patch actions are emitted via the Vercel AI SDK `tools` path (typed,
   validated args), not a JSON block embedded in the prose stream. The current text stream
   (`streamText().toTextStreamResponse()`) cannot be reliably parsed for a partial JSON block
   mid-stream; tool calls give typed objects for free and remove the brittle in-band parser. The
   existing markdown-link parser stays only as a backwards-compatible fallback.
7. **Local workspace state first.** This take-home has no backend/database. Applied chat edits
   should update in-memory imported/workspace state and rerun the scheduler, matching the current
   Data Import behavior. Durable persistence stays out of scope.
8. **Clinical content remains guarded.** The assistant may reschedule, explain, or propose
   availability/travel edits. It should not rewrite medication/treatment content unless the user
   imports an updated action plan or explicitly confirms a practitioner-authored change.
9. **The model never fabricates a fixture.** `importAvailability` / `importActivities` are **not**
   LLM-emittable patches — a model emitting `availabilityJson: unknown` could fabricate an entire
   data set. Imports stay strictly user-initiated through the existing Data tab (which already
   validates). Chat may *suggest* "import an updated plan", but the JSON only ever enters through a
   user action.

## Interaction design

### Composer context tray
Add a compact tray above the textarea:

```
[Day Jun 22] [Slot 07:30-08:00 busy: breakfast] [Action Remote Brisk Walk] [Trace substituted]
Ask the allocator...
```

Behavior:

- Clicking a calendar day creates an **active day context**.
- Clicking an action row creates an **active occurrence context** and keeps the day context.
- Dragging or selecting a time range in the day timeline creates a **timeBlock context**.
- Clicking an occupied block, resource lane, bundle header, trace row, or travel-period marker
  creates the matching typed context.
- Each block has a remove control. Removing it guarantees it will not be sent on the next chat
  request.
- Blocks created by navigation are "active" and update as selection changes. Blocks explicitly
  pinned from the tray stay until removed.
- On mobile, the context tray must remain visible above the composer even when the workspace pane
  is hidden, otherwise users cannot tell what chat sees.

### `@` context insertion
Typing `@` opens an autocomplete popover backed by workspace objects:

| Context type | Example tokens | Resolver |
| --- | --- | --- |
| Current selection | `@this`, `@selected`, `@current-day` | Current `WorkspaceSelection` |
| Day/range | `@Jun22`, `@2026-06-22`, `@this-week`, `@June` | Schedule date/range |
| Time block | `@07:30`, `@Jun22 07:30-08:00` | Calendar/day timeline selection |
| Occurrence | `@RemoteBriskWalk`, `@occ-act-042-2026-06-22` | Scheduled occurrence id/title |
| Activity | `@VO2MaxPrimer`, `@act-042` | Activity fixture |
| Bundle | `@MorningMeds`, `@BreakfastRoutine` | `displayBundleLabel` group |
| Busy block | `@breakfast`, `@commute`, `@board-meeting` | `availability.memberBusy` |
| Resource | `@treadmill`, `@physio`, `@hotel-gym` | Resource availability role/kind |
| Travel | `@SingaporeTrip`, `@TokyoTrip` | Travel window metadata |
| Trace/debug | `@trace:RemoteBriskWalk`, `@skipped`, `@substitutions` | Diagnostics/adaptations |
| Data source | `@activities`, `@availability`, `@hints`, `@imported-plan` | Current fixture/import state |

Selecting an `@` suggestion inserts a context chip, not just text. The visible prompt can still
show a short token, but the request body should carry the canonical typed ref.

**Title disambiguation.** A bare title like `@RemoteBriskWalk` is ambiguous — that activity recurs
across ~90 dates, so it maps to one `activity` ref but many `occurrence` refs. The autocomplete must
disambiguate explicitly rather than guess:

- If a day is in context, rank that day's occurrence first, labelled with its date.
- Always offer the **activity** ref (whole series) and the **selected/most-adapted occurrence** ref
  as distinct suggestions, so the user picks the scope.
- A title that resolves to zero current occurrences (e.g. fully skipped) still offers the activity
  ref plus a `@trace:` ref, never an occurrence ref that doesn't exist.

### Command semantics
Support natural language first, but allow slash-style shortcuts for precision:

| Intent | Examples | App behavior |
| --- | --- | --- |
| Explain | `/explain @this`, "why here?" | Answer from trace, occupied blocks, temporal rules |
| Navigate | `/open @SingaporeTrip`, "show this in resources" | Switch tab/date/filter/selection |
| Compare | "compare @VO2MaxPrimer vs @RemoteBriskWalk" | Show priority, feasibility, score reasons |
| Find | "find actions affected by @TokyoTrip", "what breaks during the @treadmill outage?" | Open filtered list or return linked matches (travel **and** equipment/specialist outages) |
| Retime (preferred) | "put my brisk walks in the morning" | `setTemporalPolicy` draft, validate, preview, Apply — reruns cleanly |
| Block time | "block Jun 24 18:00-20:00 for dinner" | `addBusyBlock` draft, rerun preview |
| Unblock time | "make Wednesday lunch available" | `removeBusyBlock` (date-scoped) draft, rerun preview |
| Travel edit | "extend @SingaporeTrip by one day" | `editTravelWindow` draft, rerun preview |
| Move one occurrence | "move @this to Friday afternoon" | `OutputOverride` — deferred past Phase 3; won't survive rerun |
| Bundle | "group these morning meds as one routine" | `OutputOverride` — deferred; relabel only |
| Import | "import this availability JSON" | User-only via Data tab (decision 9); chat suggests, never emits the JSON |

## Agent action protocol

Actions are emitted through the AI SDK **tool-call channel** (decision 6), not parsed out of the
prose stream. Each tool has a typed argument schema; the client renders the tool call as an action
card. Keep the current markdown link parsing only as a backwards-compatible fallback.

### Navigation actions
Navigation actions can execute immediately when the user clicks the action card:

```ts
type ChatNavigationAction =
  | { kind: 'openTab'; tab: 'calendar' | 'activities' | 'resources' | 'trace' | 'data' }
  | { kind: 'selectDate'; date: string }
  | { kind: 'selectOccurrence'; occurrenceId: string }
  | { kind: 'focusResource'; resourceKey: string }
  | { kind: 'setFilters'; status?: string[]; activityType?: string[] };
```

### Transport contract (how tool calls reach the client)

Decision 6 is not free: today `/api/chat` returns plain text via `streamText().toTextStreamResponse()`
(`route.ts:83`) and `ChatSurface` decodes UTF-8 chunks into `{ role, content }` bubbles
(`ChatSurface.tsx:196`). Tool calls have nowhere to surface. The contract:

- **Server:** switch the route to `streamText({ tools, ... }).toUIMessageStreamResponse()` (AI SDK
  v6, `ai@6.0.193`). The UI-message stream carries ordered `text` / `tool-call` / `tool-result`
  parts in one response — prose still streams; actions arrive as typed parts.
- **Client message shape:** move from `{ role, content: string }` to a parts model
  `{ role, parts: Array<{ type: 'text'; text } | { type: 'tool-<name>'; state; input; output }> }`.
  Render text parts as today; render each tool-call part as a `ChatActionCard` / `DraftPatchPreview`
  inline at its position in the stream.
- **Client transport:** add `@ai-sdk/react` (not currently installed) and use `useChat` to consume the
  UI-message stream — it handles partial tool-call assembly so we don't hand-roll a parser. (Fallback
  if we refuse the dep: a thin manual reader of the UI-message-stream protocol, accepted as more
  fragile.)
- **Coexistence:** one assistant turn may contain prose **and** a navigation action **and** a draft
  patch; parts render in stream order. Navigation cards are click-to-execute; patch cards gate on Apply.
- **Sequencing:** this migration is the **first task of Phase 2**, bundled with navigation actions —
  Phase 1 ships on the existing text transport (it adds context + grounding only, no assistant actions),
  so the working chat (acceptance A5) is not disturbed until Phase 2 deliberately reworks it.

### Patch composability

The patch union is split by whether the edit composes with a deterministic rerun (decision 4).

**Input edits — rerun-safe.** These change a scheduler *input*; the rerun derives every downstream
placement. This is the default class and the only one Phase 3 ships:

```ts
type InputPatch =
  // Add a one-off busy block (single TimeBlock) OR a recurring one (repeat across the window).
  | { kind: 'addBusyBlock'; date: string; startTime: string; endTime: string; title: string;
      category: string; recurrence?: 'once' | 'weekly' }
  // A MemberBusyBlock has ONE id but MANY TimeBlocks (e.g. every breakfast). `date` scopes the
  // removal to one instance; omitting it removes the whole recurring group. TimeBlocks have no
  // id of their own, so the (busyBlockId, date) pair is the instance key.
  | { kind: 'removeBusyBlock'; busyBlockId: string; date?: string }
  | { kind: 'editTravelWindow'; travelId: string; startDate: string; endDate: string }
  // The most natural schedule edit for this architecture: change an activity's preferred window /
  // anchor. Patches a COPY of `activity.temporalPolicy` directly (see note below); reruns cleanly.
  | { kind: 'setTemporalPolicy'; activityId: string; preferredWindows?: TimeBlockPreference[];
      anchor?: ActivityTemporalPolicy['anchor'] };
```

**Output overrides — do NOT survive a rerun.** These pin or relabel a specific occurrence and are a
separate, lower-priority class. They must define what happens on the *next* rerun (they are dropped
unless re-expressed as an input constraint). Deferred past Phase 3 unless explicitly prioritized:

```ts
type OutputOverride =
  | { kind: 'moveOccurrence'; occurrenceId: string; targetDate: string; targetStartTime?: string }
  | { kind: 'setDisplayBundle'; occurrenceIds: string[]; label: string };
```

`moveOccurrence` is the awkward case: honoring it needs either a new *pin* input to the scheduler
(contradicts "not a constraint-solver rewrite") or a post-scheduler override (contradicts "code
validates feasibility"). Prefer steering users toward `setTemporalPolicy` ("put my walks in the
morning") which reruns cleanly, and treat a literal one-occurrence move as an explicit override the
next rerun will discard.

**`setTemporalPolicy` must patch the activity, not a hint.** `buildPolicyResolver` resolves
`activity.temporalPolicy` (source `explicit`) *before* it ever consults the hint map
(`temporal-scheduler.ts:116`), and the demo-critical activities all carry explicit fixture policies —
so a hint-path override would be **silently ignored** for exactly the activities a user is most likely
to retime. Resolution: `setTemporalPolicy` mutates a **copy of `activity.temporalPolicy`** on a patched
activities array (the highest-precedence layer, an *input* per decision 4) and reruns. This needs **no
scheduler change** and no new override layer.

`importAvailability` / `importActivities` are intentionally **absent** from this protocol (decision 9).

### Patch flow

1. Chat parses intent and emits a candidate patch (tool call) with rationale.
2. Client validates the patch shape (reuse the `validate.ts` guards) and shows a diff card.
3. Deterministic scheduler reruns in preview mode over the patched inputs.
4. Preview shows affected actions, newly skipped/substituted actions, and constraint failures —
   diffed against the current result.
5. User clicks Apply to update local workspace state, or Discard to leave current state unchanged.
6. **Rejection-explanation loop.** If the preview shows the requested change as infeasible (e.g. the
   moved/blocked action ends up skipped), feed the preview's `failedConstraints` + nearest-feasible
   slots back into a second assistant turn so the explanation comes from deterministic validator
   output, not model intuition. This loop is what backs the "explain rejected edits" prompt rule.

### Preview diff identity

Occurrence ids are `occ-<activityId>-<date>`, so a date change *changes the id* — a naive id diff
reads a move as delete+add. "Source activity + nearest prior slot" works as a first heuristic but is
fragile once a whole series retimes across days or several related occurrences move together.
**Implementation task:** have the scheduler emit a **stable expansion-seed id** per occurrence (the
deterministic frequency-expansion index for its source activity, independent of the chosen date), and
diff on that seed. Then bucket each occurrence as
`unchanged | moved | newly-substituted | newly-skipped | newly-scheduled`. Until the seed exists, fall
back to the activity+slot heuristic and flag any ambiguous matches in the preview.

## Grounding model

Add a general context payload instead of overloading `WorkspaceSelection`:

```ts
type ContextRef =
  | { type: 'day'; date: string; pinned?: boolean }
  | { type: 'timeBlock'; date: string; startTime: string; endTime: string; source: 'calendar' | 'busy' | 'draft' }
  | { type: 'occurrence'; occurrenceId: string }
  | { type: 'activity'; activityId: string }
  | { type: 'bundle'; date: string; label: string }
  // A MemberBusyBlock id is recurring; a clicked block is one instance, so carry the instance fields.
  | { type: 'busyBlock'; busyBlockId: string; date: string; startTime: string; endTime: string;
      title: string; category: string }
  | { type: 'resource'; kind: string; role: string }
  | { type: 'travelWindow'; travelId: string }
  | { type: 'trace'; occurrenceId: string }
  | { type: 'scheduleRange'; startDate: string; endDate: string };
```

Resolution rules:

- Resolve refs to compact summaries before sending to the model.
- Cap resolved payloads by type: top conflicts, selected traces, affected occurrences, and nearby
  occupied blocks. Never send the full 3-month occurrence list by default.
- Always include each ref's provenance: `selected`, `pinned`, `atMention`, `assistantAction`,
  or `draftPatch`.
- If a ref cannot be resolved, fail visibly in the UI before sending. Do not let stale ids become
  silent hallucination fuel.

**Resolution is layered, not split by location.** Two concerns that the original "client vs server"
framing conflated:

- **Navigable identity (client, always available).** Thread a lightweight **context index** into
  `ChatSurface` alongside the schedule: travel windows (`{id, destination, startDate, endDate}`),
  busy-block catalog (`{busyBlockId, title, category}`), resource roles, and bundle labels — a few KB,
  derived at build next to `result`. This index powers `@`-autocomplete and lets a resolved ref drive
  **deterministic navigation with no API key** (clicking `@SingaporeTrip` selects its date range
  purely client-side). Today `ChatSurface` does not receive `availability` at all
  (`AllocatorWorkspace.tsx:99`) — adding this compact index, not the full 1000-block fixture, is the fix.
- **Rich grounding summaries (server, needs the request to run).** The server still owns the canonical
  `availability` and resolves `ContextRef[]` into the capped, summarized grounding the model reads
  (`route.ts`). `occurrence`/`activity`/`trace`/`day`/`scheduleRange` come from the `result` the client
  already ships; `busyBlock`/`timeBlock`/`bundle`/`resource`/`travelWindow` summaries come from the
  server's `availability`.

So the `/api/chat` body must carry the typed `ContextRef[]`, and the client must hold the small context
index. The `ContextResolver` in [UI components](#ui-components) is the client half (identity + nav); the
server half builds the grounding summaries.

**Replace the hardcoded travel constant.** `buildGrounding()` currently hardcodes `TRAVEL_WINDOWS`
(Singapore Jun 22–29 / Tokyo Aug 10–14) to bias its adaptation sample. That duplicates
`availability.travel` and will desync the moment `editTravelWindow` mutates a trip — the assistant
would reason about stale dates right after editing one. Phase 3 must read the live `availability.travel`
array instead of the constant.

**Day-level grounding for absence.** A `day` ref with no selected occurrence must resolve to "what is
scheduled here **and what is missing and why**" (that day's occurrences + the skipped/substituted ones
with reasons), so the assistant can answer "why is this day empty?" — not just explain a single
selected occurrence.

## UI components

1. `ContextTray` - renders context blocks above the composer, supports remove/pin/focus.
2. `AtMentionMenu` - opens from textarea on `@`, ranks suggestions by current tab/selection/date,
   keyboard-navigable (↑/↓/Enter/Esc) with ARIA `listbox`/`option` roles.
3. `ChatActionCard` - renders assistant tool-call actions (navigation, explain, draft patch).
4. `DraftPatchPreview` - shows before/after schedule deltas and validation failures.
5. `ContextResolver` utilities - convert `ContextRef[]` into a compact grounding payload; runs as a
   client half (occurrence/activity/trace/day/range) + a server half (busy/time/bundle/resource/travel).
6. `GroundingDisclosure` - a collapsed "what chat sees" panel that expands to the exact typed refs +
   resolved summaries actually sent. The strongest expression of "visible beats hidden" (decision 1)
   and success criterion 1; cheap to add and a clear reviewer demo.

**Accessibility.** Context chips are removable via keyboard (focusable, Delete/Backspace removes);
the `@`-menu is a proper combobox/listbox; draft-diff cards announce added/removed/moved counts to
screen readers. None of this is free from the existing composer, so it is in-scope, not assumed.

## Implementation phases

**Status (2026-06-01): Phases 1–3 shipped, deployed, and verified live** at
https://elyx-oa.vercel.app/ (prod review 7/7; acceptance A1–A6 6/6 each phase; unit 67/69 — the 2
failures are a pre-existing `bundle.test.ts` label drift, unrelated). Phase 4 remains planned.
Commits: Phase 1 `c76fab9` · Phase 2 `0c3eef3` · Phase 3 `b13ae06` (setTemporalPolicy) + `a273902`
(busy/travel).

### Phase 1 - Explicit context and `@` injection

**✅ Shipped (`c76fab9`).** Built as scoped. One addition surfaced during integration: the calendar
day-cell click only set local state, so it didn't create a day context — added an additive optional
`onExpandDay` callback (CalendarTab → CalendarView → MonthGrid) so a bare day-click sets
`selectedDate` and the tray shows a day block.

Scope:

- Add `ContextRef` types and workspace context state.
- Render context tray above `ChatSurface` composer.
- Convert calendar day/action/bundle/resource/trace clicks into visible context blocks.
- Implement `@` autocomplete for day, occurrence, activity, bundle, resource, travel, and trace.
- Update `/api/chat` payload from `{ selection }` to `{ selection, contexts }`.
- Extend `buildGrounding()` to resolve multiple typed refs.

Verification:

- Selecting a calendar time block shows a rectangular context block near the chat bar.
- Removing the block removes it from the next request payload.
- Typing `@Remote` inserts a canonical occurrence/activity context, not only text.
- Existing starter chips and Trace/Calendar/Resources links still work.

### Phase 2 - Navigation actions

**✅ Shipped (`0c3eef3`).** Migrated chat to the AI SDK tool-call channel (added `@ai-sdk/react`
`useChat` + `toUIMessageStreamResponse`); nav tools render as click-to-execute `ChatActionCard`s.
Two deviations: (1) switched the model to `openai.chat()` (stateless Chat Completions) — the default
Responses API references prior tool-call items by id, which a Zero-Data-Retention org doesn't persist,
breaking multi-turn (`Item ... not found`); (2) shipped `openTab` / `selectDate` / `selectOccurrence` /
`focusResource` (opens the Resources tab); **`setFilters` deferred** (no shared filter state to drive —
CalendarView owns filters locally) and granular resource focus deferred.

Scope:

- Add typed assistant navigation actions alongside existing markdown links.
- Support open tab, select date, select occurrence, focus resource, and set filters.
- Add action cards in assistant messages.

Verification:

- Asking "show this in trace" with an occurrence context opens Trace and selects that occurrence.
- Asking "show Singapore trip conflicts" opens the relevant date range/filter.
- On mobile, navigation brings the workspace pane forward as current chat links already do.

### Phase 3 - Draft input edits

**✅ Shipped (`b13ae06` setTemporalPolicy; `a273902` busy/travel).** All four input-edit patches on a
preview → Apply → rerun → diff → undo rail (`schedule-patch.ts` pure core + tests, `DraftPatchPreview`
card, workspace `previewPatch`/`applyPatch`/`undoLastEdit`). Key findings vs. this plan:
- **Client-side `scheduleTemporal` was already proven** — the Data Import flow reruns it in the browser
  (`ImportPanel.tsx`), so the linchpin needed no de-risking spike.
- **No new seed id was needed.** The scheduler already keys occurrence ids on the stable `genDate`, not
  the placed day (`temporal-scheduler.ts:615`), so a busy/travel edit that moves a placement keeps the
  id; `diffResults` just gained a `movedDay` bucket (date change) alongside `retimed` (time change).
- Patch validation lives in `schedule-patch.ts` (not `validate.ts`); `setTemporalPolicy` patches a copy
  of `activity.temporalPolicy` directly (highest precedence).
- **Rejection-explanation:** the draft card shows the *deterministic* outcome (validator error +
  `now skipped` in the diff). The LLM second-turn narration (patch-flow step 6) is **deferred**.

Scope (**input edits only** — `addBusyBlock`, `removeBusyBlock`, `editTravelWindow`,
`setTemporalPolicy`; output overrides are deferred):

- Add the `InputPatch` draft objects and emit them via the tool-call channel.
- Validate patch shape with `validate.ts` guards before preview.
- Apply the patch to a *copy of the inputs*, rerun `scheduleTemporal()` in preview, diff against the
  current result (per [Preview diff identity](#preview-diff-identity)), and show
  changed/skipped/substituted occurrences.
- Wire the rejection-explanation loop (patch-flow step 6).
- Replace `buildGrounding`'s hardcoded `TRAVEL_WINDOWS` with a read of live `availability.travel`.
- Require explicit Apply before mutating local workspace state; snapshot the pre-apply state for undo.
- Confirm `scheduleTemporal` runs browser-side within an acceptable interactive budget before
  committing to a full client-side preview rerun (it runs at build today, not in the browser).

Verification:

- "Put my brisk walks in the morning" (`setTemporalPolicy`) produces a preview card, not an immediate
  mutation, and the rerun moves the series.
- "Block Jun 24 18:00–20:00 for dinner" reruns and shows which actions got displaced.
- An infeasible request explains the blocking constraints from the preview's `failedConstraints`,
  not from model intuition.
- Applying a valid busy-block edit reruns the scheduler and updates Calendar, Activities,
  Resources, Trace, and chat grounding consistently; Undo restores the prior schedule.

### Phase 4 - Stronger agent ergonomics

**◐ Partly landed early; remainder planned.** Pinned contexts (Phase 1: the tray pin toggle +
persistent blocks) and single-step undo (Phase 3: `undoLastEdit` snapshot, distinct from
`resetSchedule()`) already ship. Still open: command history, "why-not" alternatives, multi-patch
batching, JSON export, and the deferred `OutputOverride` class. Also still open from Phase 3: the
LLM rejection-explanation loop.

Scope:

- ~~Add pinned contexts that survive tab/date changes.~~ **(done — Phase 1)**
- Add command history and reusable prompts for common review flows.
- Add "why not" alternatives: when a requested move fails, show the nearest feasible options.
- ~~Add a patch-apply **undo stack** (snapshot-before-apply) so an applied edit reverts in one step,
  distinct from `resetSchedule()`.~~ **(done — Phase 3, single-step)**
- Allow **batching** multiple input patches into one preview/apply ("block dinner *and* extend the
  Singapore trip") instead of one-patch-at-a-time.
- (Optional, gated by demand) the deferred `OutputOverride` class — `moveOccurrence` /
  `setDisplayBundle` — with an explicit "won't survive the next rerun" badge.
- Add export of draft/imported state as JSON for reproducible teammate review.

Verification:

- Pinned `@SingaporeTrip` remains in the tray while browsing other dates.
- Failed reschedule requests provide top feasible alternatives with trace links.
- A two-patch batch previews as one combined diff and applies atomically.
- Undo after an apply restores the exact prior schedule; redo is not required.
- Exported JSON can be re-imported through the Data tab and produce the same schedule.

## Prompt and safety updates

Update the system prompt so the assistant:

- Treats visible context blocks as the authoritative context for the turn.
- Distinguishes answer-only, navigation, and draft-modification intents.
- Produces structured actions only for supported operations.
- Never claims a schedule edit has been applied until the app confirms Apply succeeded.
- Explains rejected edits using deterministic validator output, not model intuition.
- Keeps clinical plan content stable unless the user provides an updated source plan.

## Degraded mode (no API key)

The `@`-menu, context tray, and ref navigation run off the **client context index** (see
[Grounding model](#grounding-model)) — not the server — so they keep working when `/api/chat` returns
503 (missing `OPENAI_API_KEY`). In that state:

- Context blocks still build and a resolved `@`-ref can still drive **deterministic navigation**
  (clicking `@SingaporeTrip` selects its date range) without the model.
- Only intent parsing (explain / draft patch) and the server-side grounding summaries are disabled,
  surfaced as the existing inline notice.

This keeps the workspace useful for reviewers running without a key, matching the current "rest of the
app keeps working" contract.

## Testing & acceptance

019 reshapes the composer DOM; the 018 change already broke the A5 selector once, so new cases are
mandatory, not optional.

Playwright (`tests/drive-acceptance.mjs`), additive:

- **A7** — clicking a calendar time block renders a rectangular context block near the composer;
  its remove control drops it from the next request payload.
- **A8** — typing `@Remote` and selecting a suggestion inserts a canonical ref (assert the request
  body carries a typed `ContextRef`, not just text).
- **A9** — a reschedule/block request renders a `DraftPatchPreview` and does **not** mutate the
  schedule until Apply.
- **A10** — Apply reruns the scheduler and Calendar/Activities/Resources/Trace all reflect the change;
  Undo restores the prior schedule.
- Existing A1–A6 must still pass unchanged.

Unit (Vitest):

- `ContextResolver` — each `ContextRef` type resolves to its compact summary; unresolvable ids fail
  loudly.
- Patch validation + preview diff — shape guards reject malformed patches; the diff buckets
  occurrences as unchanged/moved/newly-substituted/newly-skipped/newly-scheduled (per
  [Preview diff identity](#preview-diff-identity)).

## What this is not

- Not multi-tenant accounts, practitioner auth, durable backend storage, or real calendar
  integrations.
- Not an autonomous medical agent that changes treatments.
- Not a full constraint solver rewrite. The scheduler remains deterministic; chat gives it better
  context and a safer interaction loop.

## Success criteria

1. The user can see and remove every structured context object included in a chat turn.
2. `@` insertion can attach at least day, occurrence, activity, bundle, resource, travel, and trace
   contexts.
3. Chat can navigate to Calendar, Activities, Resources, Trace, and Data with typed actions.
4. A selected calendar time block appears as a small rectangular context block near the chat bar.
5. A retime/travel/availability **input edit** produces a preview card and cannot mutate the schedule
   without Apply.
6. Applied preview changes rerun the scheduler and update all right-side tabs consistently; an applied
   edit can be undone in one step.
7. Invalid edits explain the violated constraints from deterministic validator output and offer
   nearest feasible alternatives when available.
8. The context tray and `@`-resolution still build context and drive deterministic navigation when no
   API key is configured.
9. Existing chat Q&A behavior, starter chips, rate-limit handling, and import rerun behavior remain
   intact (acceptance A1–A6 unchanged; A7–A10 added).

## Open decisions

1. **Auto-add policy:** recommended default is to auto-add current day/time/action as active context
   and require pinning for anything that should survive navigation.
2. **Apply scope:** recommended default is local in-memory workspace apply only; no committed fixture
   rewrite from the UI.
3. **LLM response format:** *resolved (decision 6)* — use the AI SDK tool-call path from the start,
   not an in-band JSON block. The text stream can't be reliably parsed for a partial JSON block
   mid-stream, and tool calls give typed/validated args for free. Markdown links stay only as a
   compatibility fallback.
4. **Drag-to-select timeline:** the 018 DayTimeline is two parts — proportional lane-packed **bars**
   (which have stable slot geometry) and a chronological **list** (which does not). Start with
   click-to-select on bars/list rows plus a small "Add time range" control; only add drag-select over
   the bars if their geometry proves stable enough.
5. **`moveOccurrence` support:** *recommended default* — defer the whole `OutputOverride` class past
   Phase 3 and steer users to `setTemporalPolicy` instead. Revisit only if a literal single-occurrence
   move is explicitly requested, and ship it with a "won't survive the next rerun" badge.
