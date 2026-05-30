# Deploy Runbook — Elyx Resource Allocator

This document is the deploy + submission checklist for the Elyx Resource Allocator. Hosting is gated on a green local build: every deploy must be preceded by a clean install, a successful production build, passing Vitest suite, and a clean lint. Only then do we push to `main` and let Vercel's Git integration take over.

## Deploy Mechanism

- **Vercel Git integration** is the chosen path: connect the GitHub repo and auto-deploy on every push to `main`.
- Chosen over the Vercel CLI flow because it gives a stable production URL, runs `next build` inside Vercel's clean cloud container (which is the real environment we need to validate), requires no extra local tooling, and is zero-config for a standard Next.js 14 App Router project.
- **No `vercel.json`** — Vercel auto-detects Next.js.
- **No environment variables, no secrets.** The app is fully static; all data is bundled at build.
- **Node 22** is pinned via `.nvmrc` and `package.json` `engines.node`, and mirrored in the Vercel project's Node version setting.

## Build-Time Scheduler Risk & Mitigations

The scheduler is a pure deterministic function invoked during static route render — which means it executes inside `next build` on Vercel's clean container. Anything non-deterministic or environment-coupled (clock reads, randomness, filesystem access, network calls, env reads) would either break the cloud build or produce a different output than the one verified locally. The design in backlog 005 pre-mitigates this; the runbook restates the discipline so reviewers can audit it:

| Risk | Mitigation |
| --- | --- |
| Time-dependent output | No `Date.now()`, no `new Date()` without a fixed input; canonical window dates (Jun/Jul/Aug 2025) are hard-coded. |
| Non-determinism | No `Math.random()`; tie-breaks are by stable lexical/index order. |
| Timezone drift | All date math is UTC-only; no locale-dependent formatting in the scheduler. |
| Filesystem coupling | Fixtures are loaded via ES `import` of JSON, never `fs.readFile`. |
| Network coupling | No `fetch`, no external API calls anywhere in the build path. |
| Env coupling | No `process.env` reads in the scheduler or its call sites. |

Result: the scheduler's output on Vercel is byte-identical to local.

## Pre-Deploy Gate (local)

Run these four checks in order. **Deploy ONLY from green.** If any step fails, fix it before pushing.

1. **Clean install** — wipe any stale state and reinstall from the lockfile:
   ```bash
   rm -rf node_modules .next && npm ci
   ```
2. **Production build** — must succeed end-to-end:
   ```bash
   npm run build
   ```
   Inspect the build log: the `/` route must be listed as **prerendered as static content** (the `○ (Static)` marker in Next.js's route summary). If `/` shows as dynamic (`ƒ`), the scheduler is being treated as runtime — stop and fix.
3. **Tests** — Vitest suite must be green:
   ```bash
   npm test
   ```
   All passing tests must remain passing. `it.todo(...)` placeholders are allowed to remain TODO, but **no test may FAIL**.
4. **Lint** — must be clean:
   ```bash
   npx next lint
   ```

Only when all four steps are green do you proceed to deploy.

## Deploy Steps (Vercel Git integration)

1. Push the local green build to the GitHub repo's `main` branch.
2. In Vercel, click **Add New > Project**, then import the GitHub repo.
3. On the configure screen, confirm:
   - **Framework Preset:** Next.js
   - **Build Command:** `next build`
   - **Install Command:** `npm install`
   - **Output Directory:** (auto / leave default)
   - **Node.js Version:** **22** (set explicitly in project settings to match `.nvmrc`)
4. Click **Deploy**. The first build runs the scheduler inside Vercel's cloud container; watch the build log for any deviation from the local build.
5. Once the build succeeds, capture the production URL (e.g. `https://elyx-resource-allocator.vercel.app`).

## Post-Deploy Verification (hosted URL)

Run these manual checks against the live production URL:

1. Open the URL in a **fresh / incognito** window — the calendar must render as the first screen (no landing page, no redirect).
2. Use the month switcher to navigate **Jun → Jul → Aug 2025**; each month must render without errors.
3. Confirm the `SummaryHeader` counts match expectations, and that **at least one each of `scheduled`, `substituted`, and `skipped`** occurrences is visible across the three months.
4. Drill into a `substituted` occurrence — the detail view must show which backup resource replaced the original and the substitution reason.
5. Drill into a `skipped` occurrence — the detail view must show the `skipAdjustment` and the skip reason (the occurrence should be dimmed but still visible/inspectable).
6. Resize the browser to mobile width (e.g. **360px**) — the layout must collapse to the `AgendaList` view and remain readable.
7. Open DevTools → Network and reload — there must be **no failed fetches** (no 404s, no 5xxs, no CORS errors).

If any check fails, treat it as a deploy regression: fix locally, re-run the Pre-Deploy Gate, and redeploy.

## Submission Packet

Mapped to the six assignment requirements:

1. **>=100 activities** — `src/data/activities.json`. The committed fixture contains
   102 primary activities plus 14 backup-only fallback templates.
2. **3-month availability data** — `src/data/availability.json` (Jun/Jul/Aug 2025).
3. **Scheduler** — `src/lib/scheduler.ts` (pure deterministic function) and its tests in `src/lib/scheduler.test.ts`.
4. **Readable calendar output** — `src/components/CalendarView.tsx`, rendered at the root route `/`.
5. **Hosted URL** — paste the production URL captured in the Deploy Steps; also update the hosted-URL placeholder in the root `README.md`.
6. **GitHub link + prompts** — link to the public GitHub repo and to the `docs/prompts/` directory containing the LLM prompts used to generate the activity dataset.

## Repo Hygiene

- Repository is **public** on GitHub.
- `.gitignore` excludes: `node_modules`, `.next`, `.vercel`, `.env*`, `.DS_Store`, `coverage`.
- **No secrets** are committed (there are none to commit — the app has no env vars).
- `README.md` contains the hosted URL after the post-deploy steps below.

## After Deploy

- Update the hosted-URL line in `README.md` with the real production URL.
- Re-verify the hosted URL still loads (one more incognito check).
- Commit and push the `README.md` update to `main` (this will trigger a no-op redeploy on Vercel — that's fine).
- Final sanity check: open the production URL once on a real phone-width window (or a 360px DevTools viewport) and confirm the calendar is readable.
