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
- **Scheduler is runtime-agnostic**: pure deterministic functions in `src/lib/`. The live
  app (015) calls `scheduleTemporal(activities, availability, hints?) -> ScheduleDebugResult`
  which places actions into `{ date, startTime, endTime }` (30-min slots) around the member's
  occupied blocks; the original date-only `schedule(...)` / `scheduleWithDiagnostics(...)`
  remain in `scheduler.ts` for the baseline + reuse (the temporal scheduler reuses 005's
  `isFeasible` for date-granular resource/travel feasibility). All run during static render.
- **Window:** 2026-06-01 .. 2026-08-31. 015 adds 30-min local-time placement (was whole-day);
  `AvailabilityBundle.timeZone` is the home tz, `TimeBlock.timeZone?` overrides per block.
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
                    scheduleTemporal (015), threads { result, diagnostics } into AllocatorWorkspace),
                    globals.css; api/chat/route.ts (POST → OpenAI streamText with grounding payload
                    incl. occupiedBlocks sliced to selected date ±1 day).
  src/lib/          types.ts (canonical types + 015 temporal: LocalTime/TimeBlock/MemberBusyBlock/
                    ActivityTemporalPolicy/SchedulingSemanticHints),
                    roles.ts (rich 15/7/7 vocabulary), validate.ts (hand-rolled guards incl. 015 temporal),
                    scheduler.ts (date-only greedy + scheduleWithDiagnostics + exported date/isFeasible helpers),
                    temporal-policy.ts (getDefaultTemporalPolicy by type+title),
                    temporal-scheduler.ts (015 scheduleTemporal: candidate slots → hard temporal
                    feasibility → scored allocation → ledgers), {scheduler,temporal-scheduler}.test.ts (24 tests).
                    llm/{config,prompt,rate-limit}.ts (model = gpt-5.3-chat-latest via @ai-sdk/openai;
                    sliding-window per-IP rate-limit; SYSTEM_PROMPT + buildGrounding).
  src/components/   workspace/ — AllocatorWorkspace (selection state + diagnostics threading),
                    AppHeader, WindowLayout, MobileSwitch, ChatSurface (real streamText round-trip
                    with markdown link-button parsing → workspace navigation), WorkspacePanel,
                    TabNav, tabs/{Calendar,ActionList,PriorityQueue,Resources,AllocationTrace,DataImport}Tab.
                    Plus the 006 calendar primitives (CalendarView/MonthGrid/DayCell/DayDetail/
                    AgendaList/OccurrenceCard/SummaryHeader/FilterBar/Legend) plus DayTimeline (015:
                    chronological lane, actions interleaved with occupied blocks) and ImportPanel (009).
  src/data/         activities.json (116 records; 015 temporalPolicy overrides on demo-critical acts),
                    availability.json (015: timeZone + memberBusy, 23 groups / ~1006 time blocks).
  scripts/          generate-availability.mjs (015: LLM weekly pattern → 92-day expansion;
                    npm run generate:availability; deterministic fallback w/o key).
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

**Backlog is empty — all 16 plans archived (001-016).** See `docs/archive/`. Highlights:
007 prompts+README · 008 deploy (live at https://elyx-oa.vercel.app/) · 015 temporal
availability + scheduler · 016 temporal UI/UX audit (closed: duplicate-id fix, month-cell
B/X count pills, DayTimeline slot-grouping + display bundles, scheduler-emitted Priority
off-window, temporal ImportPanel rerun, mobile AgendaList density + link nav, substituted
`← source` labels, Trace dedup + Source panel, weekly-stagger + consultation work-overlap,
and **the capacity fix** — lightening the member busy fixture cut skip rate 4.5% → 0.2% and
never-scheduled activities 38 → 3 while preserving the June cardiology + travel demos).

The take-home is **live + fully UI/UX-verified**. 33 unit tests, 6/6 Playwright acceptance,
`npm run build` static (`/` ○, `/api/chat` ƒ), lint clean, 0 console errors. Offline data
regenerators: `generate:availability`, `generate:hints`, `generate:bundles` (each deterministic
without a key). No open backlog items.
