# 1. requirement file
Read docs/requirement/

# 2. document structure
Read docs/backlog for ongoing tasks
Read docs/archive for completed tasks
When done with a task, move it to docs/archive

# 3. project canon (locked decisions)
Elyx Resource Allocator: turn a priority-ordered health action plan into a personalized
3-month calendar that adapts to availability constraints. Take-home assignment; review is
gated on the app being publicly hosted.

- **Stack:** Next.js (App Router) + TypeScript, Tailwind, Vitest. Node 22 + npm. TS strict.
  ESLint via `next lint`, no Prettier. No backend/database.
- **Scheduler is runtime-agnostic**: pure deterministic `schedule(activities, availability)
  -> ScheduleResult` in `src/lib/`. The baseline demo calls it during static route render
  with direct ES-imported fixtures from `src/data/`; optional future import/edit flows can
  call the same function client-side without changing the algorithm.
- **Window:** 2026-06-01 .. 2026-08-31. Whole-day granularity (no intra-day slots).
- **Data:** static JSON committed once (activities 116 records: 102 primary + 14
  backup-only fallbacks; availability with engineered conflicts); prompts/run record
  captured in `docs/prompts/`.
- **Resource model:** activities match availability by `(kind, role)`; rich role vocabulary
  (15 equipment / 7 specialist / 7 allied) is the canon in `src/lib/roles.ts`; 004 is a
  superset of 003. Capacity is **exclusive** (1 booking/resource/day, by priority).
- **src/ tree:** `app/` (UI route), `data/` (JSON fixtures), `lib/` (types, scheduler,
  validate, roles), `components/` (UI).

# 4. src/ structure (implemented + acceptance-verified end-to-end)
Implementation pass complete through 011/012/013; `npm install` + `npm run build` green
(`/` ○ Static, `/api/chat` ƒ Dynamic, 99.2 kB First Load JS); `npm test` 18/18 (scheduler
+ diagnostics); Playwright acceptance suite `tests/drive-acceptance.mjs` reports 5/5 PASS
on a live dev server with a real OpenAI key set (`OPENAI_API_KEY` loaded via `.env.local`,
gitignored). 116-activity fixture committed: 102 primary + 14 backup-only fallbacks.

  src/app/          layout.tsx, page.tsx (Server Component: schedules at build via
                    scheduleWithDiagnostics, threads { result, diagnostics } into AllocatorWorkspace),
                    globals.css; api/chat/route.ts (POST → OpenAI streamText with grounding payload).
  src/lib/          types.ts (canonical types incl. AllocationTrace/ScheduleDiagnostics),
                    roles.ts (rich 15/7/7 vocabulary), validate.ts (17 hand-rolled type guards),
                    scheduler.ts (greedy-by-priority pure function + scheduleWithDiagnostics
                    sibling emitting full AllocationTrace[]), scheduler.test.ts (18 tests).
                    llm/{config,prompt,rate-limit}.ts (model = gpt-5.3-chat-latest via @ai-sdk/openai;
                    sliding-window per-IP rate-limit; SYSTEM_PROMPT + buildGrounding).
  src/components/   workspace/ — AllocatorWorkspace (selection state + diagnostics threading),
                    AppHeader, WindowLayout, MobileSwitch, ChatSurface (real streamText round-trip
                    with markdown link-button parsing → workspace navigation), WorkspacePanel,
                    TabNav, tabs/{Calendar,ActionList,PriorityQueue,Resources,AllocationTrace,DataImport}Tab.
                    Plus the 006 calendar primitives (CalendarView/MonthGrid/DayCell/DayDetail/
                    AgendaList/OccurrenceCard/SummaryHeader/FilterBar/Legend) and ImportPanel (009).
  src/data/         activities.json (116 records), availability.json (complete).
  tests/            drive-acceptance.mjs (Playwright A1-A5; A4 hits live LLM when key present).
  docs/             DEPLOY.md, prompts/, backlog/ (007-010, 014-015), archive/ (001-006, 011-013), context/.
  .env.local        OPENAI_API_KEY (gitignored via .env*; mode 600).
  README.md         reviewer entry point with hosted-URL placeholder + 6-item assignment checklist.

# 5. scaffolding convention
Every `.ts`/`.tsx` file in `src/` leads with two doc comments:

```ts
/**
 * DECISION RECAP — <backlog id and title>
 * - <2-6 bullets of locked decisions relevant to THIS file>
 */

/**
 * PSEUDO-ALGORITHM (or BEHAVIOR SKETCH for UI components)
 * 1. <step in plain English>
 * 2. <step>
 */
```

Then real imports, real exported types/signatures/prop interfaces, then SKELETON bodies
(functions throw `new Error('TODO: implement per pseudo-algorithm above')` or return a
typed placeholder; React components return real Tailwind JSX shell with
`{/* TODO: ... */}` inside; tests use `it.todo('name')`). The implementation pass
replaces TODOs with real logic while preserving these comment blocks verbatim. Canonical
example: `src/lib/scheduler.ts` (algorithm) and `src/components/CalendarView.tsx` (UI).

# 6. backlog state

**Archived (completed):** 001 scaffold · 002 data model · 003 activity fixture ·
004 availability fixture · 005 scheduler · 006 calendar UI · 009 runtime import (state
hoist closed the verification gap) · 011 workspace shell · 012 scheduler diagnostics ·
013 explainability tabs + LLM chat. See `docs/archive/`.

**Still in `docs/backlog/`:**
- `007-document-prompts-and-usage.md` — README + prompts done; hosted URL still
  placeholder (filled by 008).
- `008-host-and-prepare-submission.md` — not deployed. Needs amending for the
  `OPENAI_API_KEY` env var on Vercel (see 013's archived Task §0).
- `010-iteration-gaps.md` — polish list. Items #5, #6, #8, #10, #12, #13, #14, #15,
  #17, #19 fixed. Open: #7 (filtered counts subline), #9 (chip glyph cosmetic), #11
  (mobile chip tap; deferred to 014), #16 (hosted URL; pending 008), #18 (extra
  scheduler tests; optional).
- `014-workspace-ui-ux-gaps.md` — 11 UI/UX findings from a full Playwright walkthrough.
  §2 (Data-tab calendar duplication + import state isolation) closed in this pass via
  the 009 hoist + the ImportPanel-as-toolbar refactor. Remaining items the user is
  holding for an architectural decision: §1 calendar density blowout (medication chips
  dominate); §3 Resources axis labels; §4-§6 Trace whitespace / empty-state polish /
  Priority hover; §7-§10 cosmetic; §11 data quirk (Upper Body Strength all-substituted).
- `015-temporal-availability-and-scheduler.md` — architectural plan for richer member
  availability, optional LLM-assisted semantic compilation into typed scheduling hints,
  30-minute local-time placement, temporal scheduling rules, diagnostics for rejected
  time slots, and UI toggles to show/hide occupied member slots. This is a dedicated
  robustness pass that supersedes the calendar-density part of 014 if implemented, but
  it must not block 008 deploy. 015 explicitly preserves the existing travel-substitution
  demo while making travel days more realistic.

The take-home is functionally complete at the live-server level. Remaining work: 015
architectural robustness if chosen, 014/010 polish, and deploy (008 + amend for
`OPENAI_API_KEY`).
