# 001 - Scaffold Next.js App

## Goal
Stand up the minimal Next.js + TypeScript application that hosts the Elyx Resource Allocator
assignment, and **lock the foundational runtime/architecture decisions** that files 002-008
build on. This file owns the project skeleton, tooling, and the single most consequential
choice: **where the baseline app invokes the scheduler**.

The scaffold itself stays minimal. Its job is to be a correct, deployable shell with a clear
folder contract — not to implement features owned by other files (data 002/003/004,
scheduler 005, calendar UI 006).

---

## Architecture Decisions (locked, with rationale)

### AD-1. App Router (not Pages Router) — LOCKED
Use the `app/` directory.
- **Why:** It is the current Next.js default, has no extra config, and our page is a single
  server-rendered route. App Router's React Server Components let the baseline app call the
  pure scheduler during static route render and ship the result as static HTML/JSON with zero
  client cost.
- **Tradeoff:** Slightly newer mental model than Pages Router. Irrelevant here — we use one
  route and no advanced features. Pages Router would buy us nothing.

### AD-2. Baseline app invokes scheduler during static render — LOCKED default, not algorithm lock-in
The scheduler (005) is a **pure runtime-agnostic function**. In the required V1 demo, the page
imports the static fixtures, calls `schedule(...)` during server/static route render, and
renders the resulting calendar. With fixed fixtures and no dynamic route data, this behaves
like build-time precompute on Vercel.

- **Why this over the alternatives:**
  - The required assignment inputs are **static JSON fixtures committed to the repo**
    (002/003/004), and the scheduler is deterministic. For those fixed inputs, static render is
    the cheapest hostable path and gives the reviewer a fast first screen.
  - **vs. API route:** An API route implies per-user server state or request-time data. The
    assignment does not need a backend, auth, database, or serverless function. Rejected for V1.
  - **vs. mandatory client-side compute:** Recomputing the same fixture-backed schedule on
    every page load adds bundle weight and a loading state for identical output. Rejected for
    the required V1 demo.
  - **Default:** static route render for the committed fixtures. The algorithm remains callable
    from tests, server code, or a browser-only import/rerun flow (009).
- **Ripple effects (so 005/006/008 stay aligned):**
  - **005** must export the scheduler as a **pure, side-effect-free function**
    (`schedule(activities, availability) -> ScheduleResult`). No file I/O inside it, no
    `fetch`, no global state. This keeps it callable from (a) the page render, (b) Vitest
    tests, and (c) the browser if ever needed — without lock-in.
  - **006** consumes the already-computed `ScheduleResult` as a prop in the required baseline;
    optional 009 may add a separate client-side call site for imported JSON.
  - **008** deploys the required baseline as a static/SSG Vercel app with no serverless
    functions or runtime env.
- **Tradeoff / escape hatch:** If user-imported JSON is added, call the same pure function in
  browser state (009). If authenticated practitioner edits or tenancy are required, that becomes
  a backend product and stays explicitly out of scope for this take-home.

### AD-3. Static JSON loaded via direct ES import (not `fetch`, not `/public`) — LOCKED
Fixtures live under `src/data/*.json` and are imported directly
(`import activities from "@/data/activities.json"`).
- **Why:** Direct imports are typesafe (with `resolveJsonModule`), bundled at build time, work
  identically in the page render and in Vitest, and need no network call or `/public` URL
  juggling. `fetch('/data/...')` would force a runtime request and a loading state for data we
  already have at build time. Rejected.
- **Tradeoff:** JSON is embedded in the build output. For ~100+ activities + 3 months of
  availability this is small (tens of KB). Acceptable.

### AD-4. Test framework: Vitest (not Jest) — LOCKED
- **Why:** Vitest is ESM- and TypeScript-native with near-zero config, runs the same module
  graph and `@/` path alias as the app, and is fast. Jest needs `ts-jest`/Babel and ESM
  workarounds — more config for the same result. 005's deterministic-output tests are the main
  consumer; Vitest fits.
- **How it runs:** `npm test` (CI/headless) and `npm run test:watch` (local). No browser/jsdom
  needed for 005 (pure logic). 006's component tests, **if** added, can opt into
  `jsdom` + Testing Library later — not scaffolded now.
- **Tradeoff:** Vitest is not the Next.js docs' default example (they show Jest). Minor; Vitest
  is first-class and the config cost is lower.

### AD-5. Lint = `next lint` (ESLint, Next defaults). No Prettier — LOCKED
- **Why:** `eslint-config-next` ships with `create-next-app` and covers what a take-home needs.
  Prettier is a second formatter to install, configure, and reconcile with ESLint — speculative
  tooling for a solo short-lived repo. Editor formatting + ESLint is enough.
- **Tradeoff:** No enforced formatting in CI. Acceptable for assignment scope. If desired later,
  Prettier is a one-line add — see Open Questions.

### AD-6. Node 22 LTS, npm as package manager — LOCKED
- **Why:** Node 22 is active LTS and matches the local toolchain (`v22.22.2`) and Vercel's
  supported runtimes. npm avoids requiring reviewers to install pnpm/yarn and matches the
  assignment's stated `npm install / npm run ...` verification commands. Pin via `engines` and
  `.nvmrc`.
- **Tradeoff:** pnpm is faster locally, but introduces a lockfile/tool reviewers may not have.
  Not worth it. (pnpm 9 is present locally but we standardize on npm for portability.)

### AD-7. TypeScript `strict: true` — LOCKED
- **Why:** The default `create-next-app` setting; catches the data-shape bugs most likely in a
  scheduler/fixtures project (002/005). No reason to loosen.

### AD-8. The "first page that confirms the app loads" IS the calendar route — LOCKED
- **Why:** 006 specifies the **first screen is the usable calendar, not a landing page**, and
  the assignment wants no marketing site. A throwaway "Hello, app loaded" page would be
  duplicate work deleted in 006.
- **Scaffold scope (to avoid stepping on 006):** 001 ships the **route shell only** — the
  `app/page.tsx` route, root layout, and a placeholder that renders a heading plus a count of
  loaded items (e.g. "Resource Allocator — N activities loaded"). 006 replaces the placeholder
  body with the real calendar. This proves the app loads, imports work, and routing works,
  without pre-building UI that 006 owns.

---

## Assumptions
- Next.js (latest stable) + TypeScript, App Router, `src/` directory, import alias `@/*`.
- All assignment data is static JSON committed to the repo (no DB, no backend, no auth).
- Single route (`/`) that renders the personalized plan. No multi-page navigation.
- Deploy target is Vercel with zero custom config (framework auto-detected).
- Minimal, functional styling only (Tailwind via `create-next-app` is acceptable since it is a
  zero-config default; plain CSS is equally fine — see Open Questions).

---

## Proposed `src/` Structure
This tree is a **contract** for files 002-006. Other files create their content inside it.

```
src/
  app/
    layout.tsx          # root layout (html/body, global styles import)
    page.tsx            # the single route; calls schedule(...) at render, renders calendar
    globals.css         # minimal global styles
  data/                 # OWNED BY 002/003/004 — static JSON fixtures
    activities.json     # >=100 prioritized activities (003)
    availability.json   # 3-month availability for the 4 constraint nodes (004)
  lib/
    types.ts            # OWNED BY 002 — Activity, Availability, Constraint, ScheduleResult types
    constants.ts        # OWNED BY 002 — WINDOW_START / WINDOW_END
    roles.ts            # OWNED BY 002 — canonical resource role constants
    validate.ts         # OWNED BY 002 — lightweight required-field validation helper
    scheduler.ts        # OWNED BY 005 — pure schedule(activities, availability) => ScheduleResult
  components/           # OWNED BY 006 — calendar UI (e.g. CalendarView.tsx, DayGroup.tsx)
```
- `app/` = routing + the single scheduler call site. `lib/` = pure logic/data shapes (no React,
  no Next imports → trivially unit-testable in Vitest). `components/` = presentation. `data/` =
  fixtures.
- Tests live next to source as `*.test.ts` (e.g. `src/lib/scheduler.test.ts`) — Vitest default
  discovery, no separate `__tests__` tree needed.

---

## Tasks (each tied to a verifiable check)
1. **Init project** with `create-next-app` (TypeScript, App Router, `src/`, `@/*` alias,
   ESLint). → *verify:* repo has `package.json`, `tsconfig.json` (`strict: true`), `src/app/`.
2. **Pin runtime:** add `"engines": { "node": "22.x" }` and a `.nvmrc` with `22`.
   → *verify:* `node -v` satisfies; `cat .nvmrc` = `22`.
3. **Add Vitest:** install `vitest`, add `test` and `test:watch` scripts, add a minimal
   `vitest.config.ts` that resolves the `@/*` alias. → *verify:* a trivial sample test passes
   via `npm test`.
4. **Confirm scripts** exist and run: `dev`, `build`, `lint`, `test`. → *verify:* each command
   exits 0 (see Verification).
5. **Create the route shell:** `app/layout.tsx` + `app/page.tsx`. `page.tsx` directly imports
   the (initially empty/placeholder) `src/data/*.json`, renders the app title and a loaded-items
   count placeholder where 006 will mount the calendar. → *verify:* browser shows the page with
   a non-error count.
6. **Minimal styling:** enable Tailwind via the `create-next-app` toggle; remove boilerplate
   marketing markup from the generated `page.tsx`. → *verify:* page renders without the default
   Next.js starter content; a Tailwind utility class takes effect.
7. **Add `.gitignore` and commit the scaffold** (node_modules ignored, `.next` ignored).
   → *verify:* `git status` shows no node_modules / `.next` tracked.

> Out of scope for 001 (do NOT implement here): real types/fixtures (002-004), scheduling logic
> (005), the calendar UI (006), deployment (008).

---

## Open Questions / Decisions Needed
1. **Styling: Tailwind vs plain CSS? — RESOLVED.**
   **Decision: Tailwind CSS** (enable the `create-next-app` toggle). Drives 006's responsive
   month-grid / mobile-agenda layout with utility classes and minimal custom CSS.
2. **Should 005's scheduler tests gate the build (run in CI / pre-deploy)?**
   *Recommended default:* **Run `npm test` locally and as a manual pre-deploy gate**, but do not
   add a hosted CI pipeline (GitHub Actions/Vercel checks) unless requested — that is
   infra beyond the assignment. 008 lists "confirm build" as the deploy gate.
3. **Placeholder content depth for the 001 first page.**
   *Recommended default:* **Title + loaded-items count only.** This proves imports/render work
   without building UI that 006 will replace. Confirm 006 owner is comfortable mounting into
   `app/page.tsx` rather than a new route.
4. **Add Prettier?**
   *Recommended default:* **No** (ESLint via `next lint` is sufficient for scope). Revisit only
   if multiple contributors join.

---

## Dependencies & Interfaces (what 001 provides to others)
- **To 002:** the `src/lib/` (types, validate) and `src/data/` locations and the `@/*` alias.
- **To 005:** a pure-function contract — `schedule(...)` lives in `src/lib/scheduler.ts`, no I/O,
  callable from the page render, Vitest, and an optional client-side import flow. Vitest is wired
  and ready.
- **To 006:** the route shell (`app/page.tsx` + `layout.tsx`) and `src/components/` location;
  006 receives `ScheduleResult` as a prop from the page in the required baseline.
- **To 008:** a zero-config, no-backend, statically renderable Next.js app deployable to Vercel
  with default settings; `npm run build` is the deploy gate.

---

## Verification (success criteria)
- `npm install` completes with no errors and produces a lockfile (`package-lock.json`).
- `npm run dev` serves the app at `localhost:3000`; the page renders the title and a
  non-zero/placeholder loaded-items count with no console errors.
- `npm run build` exits 0 and produces a static/SSG output for `/` (build log shows the route as
  static, not dynamic — confirming the baseline call site).
- `npm run lint` exits 0.
- `npm test` runs the sample Vitest test and exits 0.
- `tsconfig.json` has `"strict": true`; `.nvmrc` and `engines.node` pin Node 22.
- `src/` matches the Proposed Structure; node_modules and `.next` are gitignored.
