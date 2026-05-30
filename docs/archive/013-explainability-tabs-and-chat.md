# 013 - Explainability Tabs and LLM Chat

## Goal
Fill in the workspace shell (011) with real content: six right-panel tabs that expose
allocator nodes and explainability, and a real **LLM-backed** chat surface on the left.
Add reviewer-facing Playwright acceptance tests that prove a user can answer "why?" via
the UI.

**Depends on 011 (shell) AND 012 (diagnostics). Do not start until both have landed.**

Cross-file dependency: this file introduces an `/api/chat` route + an LLM provider env
var (`OPENAI_API_KEY`), which requires **008-host-and-prepare-submission.md** to be
amended (see Tasks §0).

## Why a real LLM (not deterministic)

The user explicitly chose "Implement LLM provider right from the start, don't make it
deterministic" over a deterministic-V1-with-seam alternative. Trade-off accepted:
- ➕ Demonstrates a complete product flow on the hosted URL: ask a question, get a real
  answer grounded in the schedule + diagnostics.
- ➖ Requires an API key env var (breaks the "no env vars, no secrets" line in 008).
- ➖ Adds a network dependency: hosted-URL chat fails if rate-limited or key missing.
- ➖ Costs $$ per call. Mitigation: rate-limit per IP, conservative max tokens, no
  conversation history beyond N turns.

Trace data from 012 is the chat's grounding source; the prompt template embeds the
selected occurrence's `AllocationTrace` and a compact view of the schedule rather than
the entire 50 KB diagnostics.

## Architecture Decisions

- **`/api/chat` is a Vercel Node/Edge function.** The static `/` route still
  prerenders; the `/api/chat` route is server-side. Static deploy story still holds for
  the calendar; the chat is a tiny passthrough function.
- **Streaming responses.** Server-Sent Events via the AI SDK's `streamText` (or
  equivalent). The chat UI appends tokens to the latest assistant message as they
  arrive.
- **Provider: pluggable, default OpenAI `gpt-5.3-chat-latest`.** Use the Vercel AI
  SDK (`ai` + `@ai-sdk/openai`) so the provider is swappable via a single line. OpenAI
  is the chosen default per user direction; Anthropic / Gemini drop in via the same
  SDK if we ever swap. The `*-chat-latest` snapshot is OpenAI's "always-current chat
  snapshot" pattern — verify the exact identifier at implementation time (see Open
  Question §1 below) since point-release names drift.
- **Stateless server, client carries conversation.** No DB. The client sends the
  conversation array + selected occurrence + a compact schedule snapshot in the
  request body. The server adds a system prompt and forwards to the LLM.
- **Grounding payload, not the full dataset.** The chat request includes:
  - The active `WorkspaceSelection` (selectedOccurrenceId + selectedDate).
  - That occurrence's `AllocationTrace` (from 012) verbatim.
  - A compact `ScheduleSummary` (per-month counts of scheduled/substituted/skipped) —
    not the full 9000-occurrence list.
  - The activity definitions referenced by the selected trace (source + backups).
  - A short list of "active conflicts" derived from `availability`.
  This keeps each request well under the model context window and below ~$0.02 per
  turn at default models.
- **Tabs are state-driven, not URLs.** Inherits 011's selection model. No URL sync in
  V1.
- **Tab content is read-only.** No editing, no creation. Action List sorts/groups
  existing activities; Resources visualises existing availability; Allocation Trace
  reads existing diagnostics. The only mutable surface is Data/Import (already wired
  in 011 via the existing `ImportPanel`).
- **Six tabs may be five at implementation time.** Open question: collapse Action List
  + Priority Queue into one "Activities" tab with a sort toggle — see §3.

## Reference Patterns

- `/Users/duyvt6663/github/app/src/components/organisms/chat/chat.tsx` — chat scroll +
  composer + streaming patterns. Read before drafting.
- Vercel AI SDK docs: https://sdk.vercel.ai/docs (model-agnostic streaming).
- 012's `AllocationTrace` shape — the canonical evidence the chat reasons over.

## Tab Inventory

| # | Tab id | Title | Data source | Stub in 011? |
|---|---|---|---|---|
| 1 | `calendar` | Calendar | `ScheduleResult` (existing) | ✓ real |
| 2 | `actions` | Action List | `Activity[]` (existing) | stub |
| 3 | `priority` | Priority Queue | `Activity[]` + per-activity outcome counts derived from `ScheduleResult` | stub |
| 4 | `resources` | Resources | `AvailabilityBundle` | stub |
| 5 | `trace` | Allocation Trace | `ScheduleDiagnostics.traces[]` (from 012) for the selected occurrence/date | stub |
| 6 | `data` | Data / Import | `ImportPanel` (existing) | ✓ real |

If §3's open question collapses Actions + Priority, the final count is 5.

## Tasks

### 0. Cross-file prerequisite

0. **Amend `008-host-and-prepare-submission.md`** to allow an LLM provider API key as
   a Vercel env var. Add a "Secrets / Env Vars" subsection documenting `OPENAI_API_KEY`
   is required for `/api/chat` to function. Note that without the env var, the chat
   surface degrades gracefully (shows a "chat not configured" notice; does NOT break
   the calendar render). → *verify:* 008 mentions the env var; the rest of 008's
   no-secrets stance applies to everything except this single key.

### 1. Provider + transport

1. **Confirm the OpenAI model identifier.** The recorded default is
   `gpt-5.3-chat-latest`. Before writing code, verify against the OpenAI models
   endpoint (or docs) that this exact identifier resolves. If the actual current
   `*-chat-latest` snapshot is a different point release (e.g. `gpt-5-chat-latest`,
   `gpt-5.2-chat-latest`), update the constant in `src/lib/llm/config.ts` and note
   the substitution here. → *verify:* `curl https://api.openai.com/v1/models -H
   "Authorization: Bearer $OPENAI_API_KEY" | jq '.data[].id' | grep chat-latest`
   confirms the chosen id is live.
2. **Install dependencies**: `ai`, `@ai-sdk/openai`. Pin versions in package.json. →
   *verify:* `npm install` clean; no new audit highs.
3. **Implement `src/app/api/chat/route.ts`** (Edge or Node runtime per AI SDK guidance):
   - Accept POST body `{ messages, selection, trace, scheduleSummary, activities }`.
   - Build a system prompt: "You are the Elyx Allocator Assistant. Answer in 1-3
     sentences. Cite occurrenceIds and dates explicitly. Use only the provided trace
     and schedule snapshot — never invent facts. If the selection is empty, ask the
     user to click an occurrence."
   - Stream the response via the AI SDK's `streamText`.
   - On missing env var: respond `503` with body `{ error: 'chat not configured —
     OPENAI_API_KEY missing on server' }`.
   - On provider error: respond `502` with a short error message.
   → *verify:* `curl -N -X POST` with a valid body streams tokens; with no env var
   returns 503; with malformed body returns 400.
4. **Add basic rate-limit**: in-memory per-IP counter (resets on cold start). 20 calls
   per hour per IP. Out-of-scope: durable rate-limiting, captcha, etc. → *verify:*
   21st call within an hour returns 429.

### 2. Chat client wire-up

5. **Implement `ChatSurface.tsx` body** (011 left the skeleton): use the AI SDK's
   `useChat` (or hand-rolled `fetch` + `ReadableStream` decoder if avoiding the hook).
   Bind to `/api/chat`. Send `selection`, `trace` (for the selected occurrence — null
   otherwise), `scheduleSummary`, and the referenced `activities`. Stream tokens into
   the latest assistant message bubble. → *verify:* typing a prompt + Enter sends the
   request; tokens appear progressively; final message persists in scrollback.
6. **Starter chips** above the composer, visible only when conversation is empty:
   - "Why was this skipped?" (disabled if no selection).
   - "What changed during travel?" (always enabled; ignores selection).
   - "Show substituted items this month" (jumps tab to Calendar with status filter).
   - "What resources are constrained?" (jumps tab to Resources).
   - "Walk me through this trace step by step" (disabled if no selection).
   Clicking a chip pre-fills the composer; user presses Enter to actually send.
   *Decision:* chips populate the input but do NOT auto-send — preserves agency.
   → *verify:* each chip fills the composer with its expected text; disabled state
   correctly reflects the selection.
7. **Chat answer links → workspace navigation.** The model's output may include
   markdown links like `[Trace](trace://occ-act-003-2026-06-01)` or
   `[Calendar](tab://calendar?date=2026-06-22)`. Render those as buttons that call
   `select({ activeTab, selectedOccurrenceId?, selectedDate? })`. The system prompt
   instructs the model to use this format for any UI handoff. → *verify:* a prompt
   like "Walk me through this trace" produces a clickable `[Trace]` link that
   switches the right panel to the Trace tab with the right occurrence selected.

### 3. Right-panel tab content

8. **Actions tab (`tabs/ActionListTab.tsx`)** — replace 011's stub. Table or card
   list of `activities`, default grouped by `type`, with secondary sort options
   (frequency / remote-eligibility). Columns: id, title, type, frequency, priority,
   facilitator, locations, canBeRemote, prep summary, resources summary, backup chain
   length. Row click → `select({ selectedOccurrenceId: null, selectedDate: null })`
   plus an activity-detail side area, OR a row-expand inline (recommended: inline).
   → *verify:* renders all activities; sort/group switches update the list; no
   horizontal scroll at 1280px.
9. **Priority Queue tab (`tabs/PriorityQueueTab.tsx`)** — replace 011's stub. List of
   activities sorted strictly by `priority` asc with per-activity outcome counts
   computed from `ScheduleResult.occurrences`:
   - scheduled count, substituted count, skipped count.
   - A small inline bar chart (3 stacked colored segments using the locked status
     colors).
   Row click navigates to Allocation Trace tab with that activity's first occurrence
   selected. → *verify:* the priority-1 activity is at the top; counts sum to its
   total occurrence count; clicking a row jumps tabs.
   *Open question:* fold Actions + Priority into one "Activities" tab with a sort
   toggle (see §3 below).
10. **Resources tab (`tabs/ResourcesTab.tsx`)** — replace 011's stub. Three sections:
    Equipment (15), Specialists (7), Allied Health (7), plus Travel (2). For each
    resource, render a horizontal mini-timeline of the 92-day window with
    blocked/available ranges colored:
    - Equipment: green band default, red overlay during `blocked` ranges.
    - Specialists/Allied: gray band default (unbookable), green overlay during
      `available` ranges.
    - Travel: gray band default, red overlay during member-blocked ranges.
    A small label per resource. Hover/tap on a range shows the exact dates. →
    *verify:* all 31 resources visible; treadmill's Jul 6-12 maintenance is a red
    band; cardiologist's two narrow windows are visible; physio's leave gap is
    visible.
11. **Allocation Trace tab (`tabs/AllocationTraceTab.tsx`)** — replace 011's stub.
    Reads `ScheduleDiagnostics.traces` (012) and shows the trace for
    `selection.selectedOccurrenceId`. If no selection, render a centered prompt:
    "Click an occurrence in the Calendar or Resources tab to see how it was
    allocated." When a trace is selected, render:
    - Header: occurrence id, date, status, source activity title.
    - Numbered attempt list: each `AllocationAttempt` as a card showing
      `candidateActivityId`, `isPrimary`, `feasible`, and either `failedConstraints[]`
      (with role/resource pills) or `boundResources[]` (with role: resourceId).
    - Chosen attempt visibly marked (e.g. green border + "✓ chosen").
    → *verify:* selecting Jun 1 cardiology occurrence shows 1 attempt with
    failedConstraints kind=specialist role=cardiologist; selecting Jul 6 fitness
    shows 2 attempts, chosen=2 (the home backup).
12. **Data / Import tab (`tabs/DataImportTab.tsx`)** — already wired in 011. 013
    does NOT touch this beyond verifying it still works inside the new tab container.

### 4. Selection wiring

13. **Click handlers across tabs and calendar** all call `select(...)` from the
    workspace selection model (011):
    - Calendar chip click → `select({selectedOccurrenceId, selectedDate, activeTab})`
      (does NOT auto-switch tab; just records selection).
    - Resources timeline-range click → `select({selectedDate, activeTab: 'resources'})`.
    - Action List / Priority Queue row click → activity-level selection; clicking
      a specific outcome chip in PriorityQueue navigates to Trace with that
      occurrence's id.
    - Chat answer link click → `select(...)` as encoded in the link URL.
    → *verify:* selection state survives tab switches; the Trace tab always reflects
    the currently selected occurrence id when one exists.

### 5. Acceptance Playwright suite

14. **`drive-013.mjs`** (or `tests/acceptance.spec.mjs`) — Playwright spec.
    Asserts the explainability flow end-to-end on the dev server:
    - **A1** Click skipped Jun 1 cardiology in Calendar → Trace tab → shows
      `specialist unavailable` failed constraint for `cardiologist`.
    - **A2** Click Jul 6 substituted fitness → Trace tab → shows 2 attempts, chosen
      = 2 (home backup), failed constraint on attempt 1 = `equipment` + `treadmill`.
    - **A3** Open Resources tab → see cardiologist's two narrow available windows
      and travel-01 Singapore block (Jun 22-29) and treadmill maintenance window.
    - **A4** Select a skipped occurrence, click starter chip "Why was this skipped?",
      press Enter → assistant streams a response, response mentions the selected
      occurrence id and the failed constraint, response includes a `[Trace](...)`
      link. *Requires `OPENAI_API_KEY` set in the test env*; if absent, mark this
      test as `test.skip` with a clear note. We do NOT mock the LLM in V1.
    - **A5** Resize to 360px → MobileSwitch sticky → toggle Workspace → tabs still
      navigable; toggle Chat → composer focusable. No layout breakage.
    → *verify:* `node drive-013.mjs` runs to completion; A4 may skip if no key;
    others must pass. Zero `pageerror` / `console.error`.

## Open Questions / Decisions Needed

1. **Exact OpenAI model identifier.** Recorded default: **`gpt-5.3-chat-latest`** (user
   direction). The `*-chat-latest` suffix is OpenAI's "always-current chat snapshot"
   pattern, so the identifier is intended to be stable across point releases — but
   the precise major/minor version (5, 5.2, 5.3, etc.) drifts as OpenAI rolls
   updates. *Recommended at impl time:* `curl https://api.openai.com/v1/models -H
   "Authorization: Bearer $OPENAI_API_KEY" | jq '.data[].id' | grep chat-latest`
   and adopt whichever `*-chat-latest` matches the user's expectation. Update
   `src/lib/llm/config.ts` and note any substitution back into this file. The
   provider (OpenAI) itself is locked.
2. **Collapse Actions + Priority into one "Activities" tab with sort toggle.**
   *Recommended:* yes — same dataset, different sort. 5 tabs are easier to glance at
   than 6 and the toggle is one extra button. Open for input; if rejected, keep both
   tabs as specced.
3. **Chat conversation persistence.** *Recommended:* in-memory only (lost on refresh).
   `localStorage` is a reasonable follow-up but speculative now. No backend DB.
4. **Rate-limiting bypass for the demo URL.** *Recommended:* in-memory per-IP, 20/hr,
   no bypass. If a reviewer trips it during demo, that's an acceptable consequence of
   shipping a real LLM without a paid backend.
5. **Should the Trace tab show ALL traces in a virtualized list, or only the selected
   trace?** *Recommended:* only the selected trace + a small "select an occurrence"
   empty state. A list of 9000 traces is not useful UI. The Calendar/Resources tabs
   are the entry points to selection.

## Dependencies & Interfaces

- **From 011:** `AllocatorWorkspace` selection state, tab nav, ChatSurface skeleton,
  the 4 stub tabs (which 013 replaces) and the 2 already-real tabs (Calendar, Data).
- **From 012:** `ScheduleDiagnostics.traces` + the validators for it. The Trace tab
  and the chat grounding payload both read traces by `occurrenceId`.
- **From 008 (amendment):** `OPENAI_API_KEY` configured as a Vercel project env var.

## Verification

- `npm install` adds `ai` + `@ai-sdk/openai` and `npm run build` exits 0.
- `npm test` 15/15 still green (scheduler tests unchanged).
- All 6 tabs (or 5 after §2) render real content; clicking each tab works at desktop
  and mobile widths.
- Acceptance suite `drive-013.mjs` reports A1-A3 + A5 PASS; A4 PASS when env key set,
  SKIP with explanatory note otherwise.
- Chat: typing a question with a selection → tokens stream in within ~3s start-of-stream;
  response cites the selected occurrence id; a `[Trace]`-style link in the response
  navigates the right panel to the Trace tab.
- Without env key: chat composer shows a small inline "Chat not configured" notice
  AT the composer (not a full-page error); rest of the app (calendar, tabs) works
  normally.
- Mobile (360px): MobileSwitch toggles cleanly; selecting an occurrence in the
  Calendar pane and toggling to Chat preserves the selection so chat answers reference
  the right context.
- 0 `pageerror` / `console.error` events on initial load and tab/chat interactions.
- 008's deploy runbook successfully deploys with `OPENAI_API_KEY` set; hosted URL
  shows working chat; without the env var the hosted page still loads the calendar
  and tabs (graceful degradation).

## What 013 deliberately does NOT do

- Edit activities or availability inline. Read-only across the 5 evidence tabs; Data
  tab uses 009's ImportPanel for replacement.
- Persist conversation history across sessions.
- Add user accounts / multi-tenant.
- Add a real-time / WebSocket chat. SSE streaming over POST is the only transport.
- Add scheduler editing or drag/drop reschedule.
- Build a "tools" / function-calling LLM loop. The model answers from grounding;
  it does not call back into the app to take action. Future enhancement.

## Cost / Risk Notes

- Each chat turn: ~2-4 KB grounding payload + OpenAI pricing. Snapshot pricing for the
  `*-chat-latest` family is in the low-cents range per typical turn (verify the exact
  per-1K-token rate against the OpenAI pricing page at impl time, since GPT-5 family
  rates have shifted multiple times). 20 turns/hr/IP × 24 hr × 30 days × ~$0.02 ≈
  $300/month worst case per active IP — acceptable for a take-home demo. Mitigation:
  in-memory rate-limit per IP (Tasks §4).
- Cold-start latency for the API route is ~200-500ms on Vercel.
- Live LLM cost during reviewer evaluation is on the user's account. Optional: gate
  the chat behind an "Enable chat" button users have to click to incur cost.
