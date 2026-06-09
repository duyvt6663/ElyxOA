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
Implementation pass complete through 011/012/013 + 015-020/022-023; `npm install` +
`npm run build` green (`/` ○ Static 173 kB First Load JS, `/api/chat` ƒ Dynamic); `npm test`
**86/86**; Playwright acceptance suite `tests/drive-acceptance.mjs` reports **A1–A13 13/13 PASS**
on a live dev server with a real OpenAI key set (`OPENAI_API_KEY` loaded via `.env.local`,
gitignored). 116-activity fixture committed: 102 primary + 14 backup-only fallbacks. 023 adds
116 committed activity-education profiles (`src/data/activity-education.json`).

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
                    feasibility → scored allocation → ledgers; 023 sets occ.effectiveActivityId =
                    chosen candidate), {scheduler,temporal-scheduler}.test.ts (24 tests),
                    activity-education.ts + .test.ts (023: profile lookup keyed by activityId;
                    educationForOccurrence resolves effective/fallback),
                    llm/{config,prompt,rate-limit}.ts (model = gpt-5.3-chat-latest via @ai-sdk/openai;
                    sliding-window per-IP rate-limit; SYSTEM_PROMPT + buildGrounding incl. 023 education).
  src/components/   workspace/ — AllocatorWorkspace (selection state + diagnostics threading),
                    AppHeader, WindowLayout, MobileSwitch, ChatSurface (real streamText round-trip
                    with markdown link-button parsing → workspace navigation), WorkspacePanel,
                    TabNav (5 tabs: Calendar·Activities·Resources·Trace·Data),
                    tabs/{Calendar,Activities,Resources,AllocationTrace,DataImport}Tab (017 merged
                    Actions+Priority → ActivitiesTab: sortable outcome bars + def columns).
                    Plus the 006 calendar primitives (CalendarView/MonthGrid/DayCell/DayDetail/
                    AgendaList/OccurrenceCard/SummaryHeader/FilterBar/Legend) plus DayTimeline (015:
                    chronological lane, actions interleaved with occupied blocks) and ImportPanel (009).
  src/data/         activities.json (116 records; 015 temporalPolicy overrides on demo-critical acts),
                    availability.json (015: timeZone + memberBusy, 23 groups / ~1006 time blocks),
                    activity-education.json (023: 116 education profiles, one per activityId).
  scripts/          generate-availability.mjs (015: LLM weekly pattern → 92-day expansion);
                    generate-{hints,bundles,activity-education}.mjs (LLM + deterministic fallback w/o key;
                    npm run generate:{availability,hints,bundles,activity-education}).
  tests/            drive-acceptance.mjs (Playwright A1-A13; A5 hits live LLM when key present).
  docs/             DEPLOY.md, prompts/, backlog/ (active 019-023), archive/ (001-018), context/.
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

**Active backlog:** `019-contextual-chat-agent-workspace.md` (Cursor/Claude-CLI-style visible
chat contexts, `@` refs, navigation actions, and validated draft schedule/travel edits) and
`020-guided-onboarding-and-tag-glossary.md` (status/tooling glossary, accessible tag tooltips,
and first-run/contextual guided tour), `021-db-auth-google-calendar-import.md` (Postgres/Auth.js
DB layer, Google admin login, protected expensive API routes, and Google Calendar FreeBusy import),
`022-ui-ux-polish.md` (chat formatting, tooltip/tour polish). **023 DONE** —
`023-activity-education-descriptions.md` (116 LLM-generated activity purpose/health-context profiles
surfaced in the Activities tab oneLine + Health context, the Trace "About this action"
panel with scheduled/substituted/skipped handling, and chat grounding).
`024-daily-load-realism-consultation-fitness.md` (PROPOSED, not started) — per-day load realism:
category/intensity-aware same-day overload plus a same-day high↔high recovery rule; keeps overload a
soft cost (no silent drops). Monthly/yearly due-date staggering is explicitly deferred because it would
move the locked June 1 cardiology-skip acceptance demo. Triggered by June 2 stacking 3 consultations +
2 late-night high-intensity workouts.

Archived plans 001-018 live in `docs/archive/`. Highlights: 007 prompts+README · 008 deploy
(live at https://elyx-oa.vercel.app/) · 015 temporal availability + scheduler · 016 temporal
UI/UX audit (closed: duplicate-id fix, month-cell B/X count pills, DayTimeline slot-grouping +
display bundles, scheduler-emitted Priority off-window, temporal ImportPanel rerun, mobile
AgendaList density + link nav, substituted `← source` labels, Trace dedup + Source panel,
weekly-stagger + consultation work-overlap, and **the capacity fix** — lightening the member busy
fixture cut skip rate 4.5% → 0.2% and never-scheduled activities 38 → 3 while preserving the June
cardiology + travel demos) · 017 merged Actions + Priority into one sortable **Activities** tab
(5 tabs total) · 018 reworked the DayTimeline action list into a **time-grouped hierarchy**
(one HH:MM header per group, no per-row timestamp, collapsible bundles, and a distinct amber
`↳ substituted (N)` sub-group).

The take-home is **live + fully UI/UX-verified**. 86 unit tests, A1-A13 13/13 Playwright acceptance,
`npm run build` static (`/` ○, `/api/chat` ƒ), lint clean, 0 console errors. Offline data
regenerators: `generate:availability`, `generate:hints`, `generate:bundles`,
`generate:activity-education` (each deterministic without a key).
