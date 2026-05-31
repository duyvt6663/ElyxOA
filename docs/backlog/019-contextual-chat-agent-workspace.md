# 019 - Contextual chat agent workspace

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
4. **No silent mutations.** Navigation actions can happen directly after a user click. Schedule,
   availability, activity, or travel edits must be shown as a draft change card with an explicit
   Apply button.
5. **Local workspace state first.** This take-home has no backend/database. Applied chat edits
   should update in-memory imported/workspace state and rerun the scheduler, matching the current
   Data Import behavior. Durable persistence stays out of scope.
6. **Clinical content remains guarded.** The assistant may reschedule, explain, or propose
   availability/travel edits. It should not rewrite medication/treatment content unless the user
   imports an updated action plan or explicitly confirms a practitioner-authored change.

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

### Command semantics
Support natural language first, but allow slash-style shortcuts for precision:

| Intent | Examples | App behavior |
| --- | --- | --- |
| Explain | `/explain @this`, "why here?" | Answer from trace, occupied blocks, temporal rules |
| Navigate | `/open @SingaporeTrip`, "show this in resources" | Switch tab/date/filter/selection |
| Compare | "compare @VO2MaxPrimer vs @RemoteBriskWalk" | Show priority, feasibility, score reasons |
| Find | "find all actions affected by @TokyoTrip" | Open filtered list or return linked matches |
| Reschedule | "move @this to Friday afternoon" | Draft patch, validate, preview, require Apply |
| Block time | "block Jun 24 18:00-20:00 for dinner" | Draft availability patch, rerun preview |
| Unblock time | "make Wednesday lunch available" | Draft busy-block edit, rerun preview |
| Travel edit | "extend @SingaporeTrip by one day" | Draft travel/busy/resource patch, rerun preview |
| Bundle | "group these morning meds as one routine" | Draft display-bundle label change |
| Import/export | "import this availability JSON" | Reuse Data Import validation, then rerun |

## Agent action protocol

Keep the current markdown link parsing as a fallback, but introduce a typed action protocol for
assistant responses.

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

### Draft modification actions
Modification actions must render as preview cards and require explicit user application:

```ts
type SchedulePatch =
  | { kind: 'moveOccurrence'; occurrenceId: string; targetDate: string; targetStartTime?: string }
  | { kind: 'addBusyBlock'; date: string; startTime: string; endTime: string; title: string; category: string }
  | { kind: 'removeBusyBlock'; busyBlockId: string }
  | { kind: 'editTravelWindow'; travelId: string; startDate: string; endDate: string }
  | { kind: 'setDisplayBundle'; occurrenceIds: string[]; label: string }
  | { kind: 'importAvailability'; availabilityJson: unknown }
  | { kind: 'importActivities'; activitiesJson: unknown };
```

Patch flow:

1. Chat parses intent and returns a candidate patch with rationale.
2. Client validates the patch shape and shows a diff card.
3. Deterministic scheduler reruns in preview mode.
4. Preview shows affected actions, newly skipped/substituted actions, and constraint failures.
5. User clicks Apply to update local workspace state, or Discard to leave current state unchanged.

## Grounding model

Add a general context payload instead of overloading `WorkspaceSelection`:

```ts
type ContextRef =
  | { type: 'day'; date: string; pinned?: boolean }
  | { type: 'timeBlock'; date: string; startTime: string; endTime: string; source: 'calendar' | 'busy' | 'draft' }
  | { type: 'occurrence'; occurrenceId: string }
  | { type: 'activity'; activityId: string }
  | { type: 'bundle'; date: string; label: string }
  | { type: 'busyBlock'; busyBlockId: string }
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

## UI components

1. `ContextTray` - renders context blocks above the composer, supports remove/pin/focus.
2. `AtMentionMenu` - opens from textarea on `@`, ranks suggestions by current tab/selection/date.
3. `ChatActionCard` - renders assistant-proposed navigation, explain, and draft patch actions.
4. `DraftPatchPreview` - shows before/after schedule deltas and validation failures.
5. `ContextResolver` utilities - convert `ContextRef[]` into compact LLM grounding payload.

## Implementation phases

### Phase 1 - Explicit context and `@` injection

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

Scope:

- Add typed assistant navigation actions alongside existing markdown links.
- Support open tab, select date, select occurrence, focus resource, and set filters.
- Add action cards in assistant messages.

Verification:

- Asking "show this in trace" with an occurrence context opens Trace and selects that occurrence.
- Asking "show Singapore trip conflicts" opens the relevant date range/filter.
- On mobile, navigation brings the workspace pane forward as current chat links already do.

### Phase 3 - Draft schedule and availability edits

Scope:

- Add `SchedulePatch` draft objects for move occurrence, add/remove busy block, edit travel window,
  and import availability/activities.
- Validate patch shape before preview.
- Rerun `scheduleTemporal()` in preview mode and show changed/skipped/substituted occurrences.
- Require explicit Apply before mutating local workspace state.

Verification:

- "Move this to Friday afternoon" produces a preview card, not an immediate mutation.
- Invalid moves explain the blocking constraints.
- Applying a valid busy-block edit reruns the scheduler and updates Calendar, Activities,
  Resources, Trace, and chat grounding consistently.

### Phase 4 - Stronger agent ergonomics

Scope:

- Add pinned contexts that survive tab/date changes.
- Add command history and reusable prompts for common review flows.
- Add "why not" alternatives: when a requested move fails, show the nearest feasible options.
- Add export of draft/imported state as JSON for reproducible teammate review.

Verification:

- Pinned `@SingaporeTrip` remains in the tray while browsing other dates.
- Failed reschedule requests provide top feasible alternatives with trace links.
- Exported JSON can be re-imported through the Data tab and produce the same schedule.

## Prompt and safety updates

Update the system prompt so the assistant:

- Treats visible context blocks as the authoritative context for the turn.
- Distinguishes answer-only, navigation, and draft-modification intents.
- Produces structured actions only for supported operations.
- Never claims a schedule edit has been applied until the app confirms Apply succeeded.
- Explains rejected edits using deterministic validator output, not model intuition.
- Keeps clinical plan content stable unless the user provides an updated source plan.

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
5. A reschedule/travel/availability request produces a preview card and cannot mutate the schedule
   without Apply.
6. Applied preview changes rerun the scheduler and update all right-side tabs consistently.
7. Invalid edits explain the violated constraints and offer nearest feasible alternatives when
   available.
8. Existing chat Q&A behavior, starter chips, rate-limit handling, and import rerun behavior remain
   intact.

## Open decisions

1. **Auto-add policy:** recommended default is to auto-add current day/time/action as active context
   and require pinning for anything that should survive navigation.
2. **Apply scope:** recommended default is local in-memory workspace apply only; no committed fixture
   rewrite from the UI.
3. **LLM response format:** simplest first step is text plus a constrained JSON action block parsed
   client-side. A Vercel AI SDK tool-call path can come later if the JSON block becomes brittle.
4. **Drag-to-select timeline:** implement only if the day timeline already exposes stable slot
   geometry. Otherwise start with click-to-select occupied/action slots and a small "Add time range"
   control.
