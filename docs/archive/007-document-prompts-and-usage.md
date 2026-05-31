# 007 - Document Prompts And Usage

## Goal

Produce the reviewer-facing documentation for "Elyx Resource Allocator" so a reviewer can, in ~5 minutes, understand what the project does, verify it against the assignment, run it locally, and see exactly which prompts/AI tools built it. Documentation is **reviewer-first** and **non-duplicative**: it points at code/decisions rather than restating them.

Two hard requirements from the assignment drive this file:
1. **Prompts used must be documented** (data generation AND app scaffolding).
2. **Submission review is gated on a working hosted URL** (see 008).

## Doc Artifacts & Locations

Exactly two doc surfaces ship for review (keep it minimal):

| Artifact | Path | Purpose | Audience |
| --- | --- | --- | --- |
| **README.md** | repo root `README.md` | The single entry point. Hosted URL, quick start, how-it-works, requirements checklist, assumptions/limitations, project structure, link to prompts. | Reviewer, top-to-bottom read. |
| **Prompts log** | `docs/prompts/` (folder, one file per task) | Verbatim/condensed prompts used to generate data and scaffold code. | Reviewer spot-check; requirement evidence. |

The `docs/backlog/` files (001-008) are **internal planning artifacts**, not part of the reviewer doc surface. README may reference 005's documented scheduler decisions, but the reviewer is never asked to read backlog files.

## Prompts Documentation Strategy

**Decision: a `docs/prompts/` folder with one file per task, NOT a single `docs/prompts.md`.**

Rationale (reviewer-friendliness + low friction):
- File 003 already proposed `docs/prompts/003-activities.md`. A folder keeps that convention consistent rather than retrofitting a monolith.
- Per-task files let each generation/scaffolding task append its own prompt at the time work happens (see Prompt-Capture Process) without merge churn on one giant file.
- A reviewer can jump straight to "how were activities generated?" (`003-activities.md`) vs. scrolling one long doc.

Folder layout and what each captures:

| File | Captures |
| --- | --- |
| `docs/prompts/README.md` | One-paragraph index: what these files are, that they cover data + scaffolding prompts. |
| `docs/prompts/003-activities.md` | Prompt(s) used to generate the ~102 activities in `src/data/activities.json`. |
| `docs/prompts/004-availability.md` | Prompt(s) used to author `src/data/availability.json` with engineered conflicts. |
| `docs/prompts/scaffold.md` | Prompt(s) used to scaffold/build the app (architecture, scheduler, UI, types). |

Prompts may be condensed to the essential instruction (not full transcripts) if a verbatim dump is noisy — the requirement is that the reader can see the *intent and shape* of each prompt.

## README Outline (concrete sections, in order)

A reviewer reads README.md top-to-bottom. Sections, in this exact order:

1. **What it is** — one line: "Transforms a priority-ordered health action plan into a personalized 3-month calendar that adapts to availability constraints (travel, equipment, specialists, allied health)."
2. **Hosted URL** — clickable link. `TODO(008): paste Vercel URL` placeholder until 008 lands. This is the gating artifact; it appears near the top.
3. **Quick start** — copy-pasteable, Node 22 + npm:
   ```
   nvm use 22        # or ensure Node 22
   npm install
   npm run dev       # local preview
   npm run build     # builds the static demo calendar
   npm test          # Vitest unit tests
   ```
4. **How it works** — 3-step pipeline, one sentence each: static JSON data (`src/data/`) → pure runtime-agnostic `schedule(activities, availability)` called by the baseline static route → readable month-grid calendar. Note the required submission has no backend/DB; optional import/rerun work is a stretch.
5. **Assignment requirements checklist** — the 6-item table below, each mapped to the concrete artifact.
6. **Scheduler assumptions & limitations** — short bullets (below); link to 005's documented greedy-vs-optimal decision rather than re-explaining the algorithm.
7. **Data model summary** — 2-3 sentences: canonical TS types in `src/lib/`, window 2026-06-01..2026-08-31, whole-day granularity. Point to types, don't restate them.
8. **Project structure** — short tree of `src/app/`, `src/data/`, `src/lib/`, `src/components/`.
9. **Prompts** — one line linking to `docs/prompts/` explaining it covers data-generation AND app-scaffolding prompts.

## Assignment Requirements Mapping (the 6-item checklist)

This table is the heart of the README — it lets a reviewer tick off each deliverable against a concrete artifact.

| # | Assignment deliverable | Fulfilled by | Where |
| --- | --- | --- | --- |
| 1 | >= 100 activities | ~102 activities authored as static JSON | `src/data/activities.json` |
| 2 | 3-month availability data | Static availability with engineered travel/equipment/specialist/allied-health conflicts | `src/data/availability.json` |
| 3 | Scheduler that allocates resources | Pure runtime-agnostic `schedule(activities, availability)`, greedy-by-priority, exclusive resource capacity | `src/lib/` scheduler + named Vitest tests |
| 4 | Readable calendar output | Hand-rolled month grid + Jun/Jul/Aug switcher, status/type filters, summary counts, skipped items shown dimmed | `src/components/` + `src/app/` |
| 5 | Hosted/deployed | Vercel deployment; hosted URL loads the calendar | README "Hosted URL" (filled by 008) |
| 6 | GitHub link + prompts documented | Public repo + per-task prompt logs | repo URL + `docs/prompts/` |

## Assumptions & Limitations to Surface

State these plainly in the README (NOT buried in code) so the reviewer isn't surprised:

- **Single member.** One person's plan/availability; not multi-tenant.
- **No practitioner accounts/RBAC.** Multi-tenant editing is a product scope, not part of this take-home.
- **Fixed 3-month window.** 2026-06-01 .. 2026-08-31, hardcoded by design.
- **Whole-day granularity.** No intra-day time slots; one booking per resource per day.
- **Greedy, not globally optimal.** Scheduler is greedy-by-priority; a higher-priority activity can consume a resource a lower-priority one needed. This is an intentional, documented tradeoff (see 005).
- **Deterministic.** Same inputs always yield the same schedule; no randomness, no wall-clock dependence.
- **Remote fallback.** Remote-capable activities can run while the member is travelling and bypass local equipment then; they still require specialist/allied-health availability.

## Reviewer Checklist (~5 minutes)

A reviewer should be able to verify the submission with these steps:

1. Open the **hosted URL** → the calendar loads (no setup needed).
2. Switch between **Jun / Jul / Aug** → see activities placed across the 3-month window.
3. Observe **scheduled** activities, and **skipped** ones shown dimmed-but-visible → confirms constraint handling is honest.
4. Use **status/type filters** and read the **summary counts** → confirms readable output.
5. (Optional) Clone repo, `npm install && npm test` on Node 22 → tests pass; `npm run build` → scheduler runs cleanly.
6. (Optional) Open `docs/prompts/` → see data-generation and scaffolding prompts.

## Prompt-Capture Process

To guarantee nothing is lost before submission:

- **Append-as-you-go.** Each data/code-generation task (003 activities, 004 availability, app scaffolding) appends its prompt to the matching `docs/prompts/<task>.md` *at the time that work is done*, not retroactively.
- **Definition of done includes prompts.** A generation task is not "done" until its prompt file exists and contains the prompt used.
- **Final sweep before submission.** A pre-submission check confirms every generated artifact has a corresponding prompt entry and the README links them. (Folds into the 008 hosting/submission gate.)

## Tasks

1. Create `README.md` at repo root following the **README Outline** above (9 sections, in order).
2. Embed the **6-item Assignment Requirements Mapping** table in the README.
3. Surface the **Assumptions & Limitations** bullets in the README; link to 005 for the greedy tradeoff instead of re-explaining it.
4. Add the **Reviewer Checklist** to the README.
5. Create `docs/prompts/` with `README.md` (index), `003-activities.md`, `004-availability.md`, `scaffold.md`; backfill prompts already used and append future ones per the capture process.
6. Add a `TODO(008)` hosted-URL placeholder in the README; replace it once 008 deploys.

## Open Questions / Decisions Needed

- **Verbatim vs condensed prompts.** Full transcripts can be noisy. **RECOMMENDED DEFAULT: condensed** — capture the essential instruction/intent per task; include verbatim text only where it materially clarifies how an artifact was produced.
- **Prompts as folder vs single file.** **RECOMMENDED DEFAULT: folder** (`docs/prompts/`, one file per task), as justified above and consistent with 003's existing proposal. Revisit only if the reviewer explicitly prefers a single scrollable file.
- **Hosted URL placement.** **RECOMMENDED DEFAULT: near the top of the README** (section 2), since review is gated on it — the reviewer should not have to hunt for it.

## Verification

- A reviewer can run the app locally **solely** from the README quick start on Node 22 (`install` → `dev`/`build` → `test`), with no tribal knowledge.
- `docs/prompts/` exists and contains a prompt entry for **every** generated artifact (activities, availability) **and** the app scaffolding.
- The 6-item requirements table maps each deliverable to a concrete artifact path/URL.
- Assumptions & limitations (single member, fixed window, whole-day, greedy non-optimal, deterministic, remote bypass) are visible in the README, not only in code.
- The README contains a hosted-URL slot that is filled (not a placeholder) at submission time.
- The Reviewer Checklist lets a reviewer confirm scheduled/skipped behavior from the hosted URL alone in ~5 minutes.
