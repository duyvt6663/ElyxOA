# 008 - Host And Prepare Submission

## Goal

Publicly host the Resource Allocator and assemble the final submission packet. This is the **highest-risk deliverable**: per the assignment, the submission will **not be reviewed** unless the app is publicly accessible. The work here is the last step in the backlog and gates the entire grade.

Concretely: get a stable public Vercel URL serving the baseline static calendar, fill the hosted-URL placeholder left in the README by 007, and confirm the GitHub repo contains everything a reviewer needs.

## Deploy Mechanism (Decision + Rationale)

**Decision: Vercel Git integration** (connect the GitHub repo, auto-deploy on push to the default branch). NOT the Vercel CLI.

Rationale:
- **Stable production URL.** Git integration assigns a permanent project alias (e.g. `elyx-resource-allocator.vercel.app`) that always points at the latest production deployment. The CLI's `vercel --prod` also produces this, but the Git path makes the URL the obvious, durable one to paste into the README.
- **Reproducible builds in the cloud.** Vercel checks out the exact committed tree and runs `next build` in a clean Linux container — this surfaces any "works on my machine" issue (see Scheduler Risk below). The CLI can upload local artifacts, which can mask such problems.
- **Zero extra tooling.** No CLI install, no auth token to manage, no `vercel login`. A solo take-home needs the fewest moving parts.
- **Free preview deployments** per push give a sanity check before promoting, at no cost.

The CLI is acceptable as a fallback if Git integration is unavailable, but it is not the recommended path.

## Static-Render Scheduler Risk & Mitigations

For the required baseline, `schedule(activities, availability)` runs while Next statically renders the route, and that build runs **on Vercel's servers**, not locally. Anything non-deterministic or environment-dependent will either break the cloud build or silently produce a different calendar than what was tested locally. Explicit risks and the mitigations that close them:

| Risk | Why it breaks the cloud build | Mitigation (already canon in 001-005) |
| --- | --- | --- |
| `Date.now()` / `new Date()` for "today" | Build clock differs from local; output drifts | Scheduler is a **pure function** of its inputs; no wall-clock reads. Window dates are the **fixed literals** `2026-06-01..2026-08-31`. |
| Timezone (`TZ`) differences | Vercel containers default to UTC; date math could shift a day | Operate on date strings / UTC-anchored dates only; never rely on local TZ. |
| Filesystem reads (`fs.readFile`, `__dirname`, `process.cwd()`) | Paths/CWD differ in the build container | Fixtures are **ES-imported** from `src/data/*.json` (bundled by the compiler), never `fs`-read and never served from `/public`. |
| Network fetch at build | No outbound assumptions; flaky/blocked | **No network** anywhere in the build. All data is local + bundled. |
| Env vars / secrets | Missing in Vercel project -> undefined behavior | **None required.** No env vars, no secrets read at build or runtime. |

**Parity check:** the `next build` Vercel runs must be the same one that passes locally. Enforce by (1) pinning Node 22 (see Config), (2) committing `package-lock.json` so `npm ci` resolves identical deps, and (3) confirming the **Vercel build log** shows `next build` completing and the calendar page rendered statically (look for the route in the prerendered/SSG list, not a server-rendered marker).

## Vercel Configuration

- **Framework preset:** auto-detected as **Next.js**. Leave the default.
- **Build command:** default `next build` (do not override).
- **Install command:** default `npm install` — acceptable, but `npm ci` is preferred for lockfile fidelity if the setting is exposed; either works since the lockfile is committed.
- **Output:** handled automatically by the Next.js adapter (static output). No manual output dir.
- **No `vercel.json`** needed. No rewrites, headers, or functions config required for a static App Router site.
- **No environment variables, no secrets.** The project settings env section stays empty.
- **Node version pinning (Node 22):** set `"engines": { "node": "22.x" }` in `package.json` AND set the Vercel project **Node.js Version** setting to 22.x. Both, so local and cloud agree even if one is later changed.

## Pre-Deploy Gate

Do **not** deploy from a dirty or red tree. Run from a clean clone (or `git clean`-equivalent state) and require all green:

```
npm ci          # clean, lockfile-exact install (deletes node_modules first)
npm run build   # next build succeeds; calendar route prerendered as static
npm test        # Vitest scheduler unit tests pass
npx next lint   # next lint clean (no errors)
```

Only after all four pass, and the working tree is committed and pushed, proceed to deploy. Pushing the green commit is what triggers the Git-integration build.

## Deploy Steps

1. **Confirm green locally** via the Pre-Deploy Gate above.
2. **Commit and push** the final state to the default branch (this is also the commit Vercel will build).
3. **Create the Vercel project** (first time only): "Add New Project" -> import the GitHub repo -> accept the Next.js preset -> set Node.js Version to 22.x -> Deploy.
4. **Watch the build log.** Confirm install, then `next build`, complete with no errors and the calendar route appears as a static/prerendered page.
5. **Capture the production URL** (the project alias, e.g. `https://<project>.vercel.app`). This is the URL for the README.
6. **Run Post-Deploy Verification** (next section) against that URL.
7. **Fill the README placeholder** (the hosted-URL slot left by 007) with the production URL; commit and push. This triggers one more build/deploy — re-verify the URL still loads after it lands.

## Post-Deploy Verification

Check the **hosted** URL (not localhost), in a **fresh/incognito** window to rule out local-only state:

- [ ] Calendar route (the landing page) loads with no console errors.
- [ ] All **three months** navigable via the Jun/Jul/Aug switcher; each renders its grid.
- [ ] **Scheduled, substituted, and skipped** occurrences are all visible/distinguishable (confirms the engineered conflicts in availability surfaced through the baseline scheduler call).
- [ ] Output matches the locally built calendar (spot-check a date with a known substitution/skip) — proves build parity.
- [ ] No local-only dependency: works in incognito, on a different network, no "localhost" assets 404ing.
- [ ] **Mobile width** (~375px) is readable — month grid does not overflow unusably.

## Submission Packet (mapped to the assignment's 6 requirements)

Final deliverables to hand in:

1. **Public hosted URL** — the Vercel production alias. (Req: *publicly hosted app, reviewable*.) **Blocking requirement.**
2. **GitHub repository URL** — public/accessible. (Req: *source code link*.)
3. **Source code** — Next.js app, scheduler, UI, in the repo. (Req: *the implementation*.)
4. **Data fixtures** — `src/data/activities.json` (~102 items) and `availability.json` (engineered conflicts), committed. (Req: *the data set used*.)
5. **Prompts documentation** — the AI prompts used, documented in the repo (per 007) and linked from the README. (Req: *prompts used*.)
6. **Usage / approach docs** — the README is the reviewer entry point and **contains the hosted URL**, run instructions, and approach. (Req: *documentation / how to run*.)

Cross-check before submitting: every one of the six maps to a concrete, committed-and-live artifact. The README ties them together (hosted URL + repo + prompts + run steps).

## Repo Hygiene

- Repository is **public** (or explicitly shared with reviewers).
- `.gitignore` excludes `node_modules/` and `.next/` (and other build artifacts); these are **not** committed.
- **Committed:** `src/data/` fixtures, prompts doc, README/docs, `package.json` + `package-lock.json`.
- **No secrets committed** — there are none to begin with, but verify no stray `.env*`, tokens, or keys are tracked.
- Default branch is the one Vercel builds; the green submission commit is the HEAD of that branch.

## Dependencies (must be done first)

008 is the **last** backlog item and depends on 001-007 being complete and green:

- 001 architecture (static baseline route, ES-imported data) — defines why the cloud build is safe.
- 002/003/004 fixtures committed and deterministic.
- 005 pure scheduler + passing Vitest tests.
- 006 calendar UI route (the landing page) renders the `ScheduleResult`.
- 007 README written with a **hosted-URL placeholder** and prompts documented — the placeholder is filled in **here**.

## Open Questions / Decisions Needed

- **Repo visibility model.** *Recommended default: make the repo fully public.* Simplest for review; a take-home rarely needs to stay private. (Alt: keep private and add reviewers as collaborators — more friction, only if confidentiality is required.)
- **Vercel account / project ownership.** *Recommended default: deploy under the author's personal Vercel free (Hobby) account.* No team/org needed; Hobby tier covers a static Next.js site at zero cost. Confirm the GitHub account used for Git integration owns the repo.

## Verification

- `npm ci` from a clean state, then `npm run build`, `npm test` (Vitest), and `next lint` all pass locally — the deploy is launched only from this green commit.
- The Vercel **build log** shows `next build` succeeding with the calendar route prerendered as static (no runtime fetch, no fs/env/network errors), confirming static-render scheduler parity with local.
- The **hosted production URL** loads the calendar in a fresh incognito session: all 3 months navigable; scheduled/substituted/skipped occurrences visible; mobile width readable; no local-only dependencies.
- The **README contains the live hosted URL** and the repo contains all six submission artifacts (hosted URL, repo, source, data, prompts, usage docs).
- The production deployment is **left intact** (not deleted) so the URL stays stable for the entire review window. Vercel's per-deployment URLs are immutable; the project **alias** is what the README points to and what advances to each new production deploy — so re-deploying to fix something keeps the same review URL.
