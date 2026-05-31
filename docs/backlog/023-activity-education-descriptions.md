# 023 - Activity education descriptions

> **STATUS — all 4 phases DONE (2026-06-01).** 116 validated education profiles generated
> (`src/data/activity-education.json`, 114 LLM + 2 deterministic fallback), surfaced in the
> Activities tab (oneLine + Health context), the Trace tab ("About this action" with
> scheduled/substituted/skipped handling), and the chat grounding. Verified: vitest 86/86 (incl.
> `activity-education.test.ts` 15), `tsc` clean, production build clean, acceptance **A1–A13 13/13**
> (A10–A13 are this plan's new cases — see "Testing and acceptance").

## Problem

The activity list and calendar detail views tell the reviewer what an action is called, how often it
appears, what resources it uses, and how the scheduler placed it. They do not yet explain enough
about the action itself:

- What does this action actually do?
- Why is it in the member's health plan?
- What health behavior, metric, or care-team goal does it support?
- When I click a scheduled action on the calendar, what should I understand beyond timing and
  allocation status?

`Activity.details` exists, but many records are generic template text such as medication adherence
language. That is enough for scheduler fixtures, not enough for a reviewer/customer-facing detail
panel.

## Goal

Generate and display short, structured education summaries for every activity:

- A one-line summary for the Activities tab list.
- A compact detail panel for expanded activity rows.
- The same education content in calendar action details when the user clicks a scheduled item.
- Conservative health-impact language that explains intent without inventing clinical advice.

This should make the app feel like a guided health-plan workspace, not only a scheduling debugger.

## Review refinements (added 2026-06-01, grounded in the shipped app)

The plan is solid on the data contract, generator, and safety. These refinements correct three
assumptions that don't match the current UI and make the integration concrete given what 019/020 shipped.

### R1. There is no "occurrence detail card" — clicking a calendar action opens the Trace

Phase 3 says to "extend selected occurrence detail cards." There are none: `OccurrenceCard` exists but
is **never rendered**, and clicking a `DayTimeline` action row only sets `selectedOccurrenceId` (it does
**not** switch tabs). The occurrence's timing/status/resources already live in the **Trace tab**
(`AllocationTraceTab`, whose `SourceActivityPanel` shows the source activity's title/type/frequency/
priority/duration/resources). So decide where "About this action" actually goes:

- **Recommended:** add a compact **occurrence detail panel inside `DayDetail`** (the `<aside>` that wraps
  the day timeline), shown when an occurrence is selected — timing/status/resources + the
  "About this action" education. This keeps the user on the calendar (no tab jump). It is a small NEW
  component, not an extension of an existing one.
- **And** extend the Trace `SourceActivityPanel` with the same `oneLine` + "About this action" (this is
  where a click *can* land via chat `selectOccurrence` / the Activities outcome link). This merges the
  plan's Phase 3 (calendar detail) and Phase 4 (trace) onto one shared education block.

Either way, keep the dense `DayTimeline` time-grouped rows **clean** — do not put `oneLine` on every
row (it would re-bloat the 018 layout). Education belongs in the detail panel / Trace / Activities, not
inline in the list.

### R2. `effectiveActivityId` must be populated for fallback education to resolve

Phase 3 resolves substituted education via `occurrence.effectiveActivityId`, but the temporal scheduler
**never sets it** (the field exists in the type only). A substituted occurrence today carries
`sourceActivityId` (original), `sourceTitle`, and `title` (the fallback's title) — but **not** the
fallback's id. So add to **Phase 1**: populate `effectiveActivityId` in the scheduler with the chosen
candidate's id (it already knows `candidateActivity.id`). Then the substituted-occurrence education
lookup is `effectiveActivityId` (fallback) + `sourceActivityId` (original), as the plan intends. Without
this, fallback education can only be matched by title (fragile) — don't do that.

### R3. Chat grounding integration is concrete now (post-019)

`buildGrounding()` already ships `activities` (the trace-referenced ones) and `activityCatalog`
(`{id,title,type}` for all 116). For Phase 4, the smallest change is to add `oneLine` to each
`activityCatalog` entry and the `whatItDoes`/`whyItMatters`/`healthFocus` to the referenced `activities`.
The model already resolves activity refs (it does so for `setTemporalPolicy`), so "what is this for?"
answers come straight from the committed education — no new tool, no hallucination.

### R4. Renumber the acceptance cases

The canonical suite (`tests/drive-acceptance.mjs`) is at **A1–A9**. Use **A10–A13** for this plan, not
A19–A22:
- A10 — Activities row shows a one-line summary under the title.
- A11 — Expanding an activity shows "Health context" (what / why / focus / signals).
- A12 — Selecting a scheduled calendar action shows "About this action" (in the detail panel or Trace).
- A13 — A substituted action shows the **fallback** education + the original-plan note.

### R5. Demo-value sequencing

For the realism the demo needs, the highest payoff is **Phase 1** (data + generator + the
`effectiveActivityId` fix) + **Phase 2** (Activities `oneLine` + Health context) + the **R1 detail
panel / Trace block**. Phase 4 (chat grounding) is a small, high-impact add on top. The `oneLine` under
each title is the single most visible "this is a real health plan" signal.

## Core decisions

1. **Separate education data from scheduler input.** Do not overload `Activity.details` or mutate the
   scheduler fixture for presentation copy. Add a separate generated file keyed by `activityId`, e.g.
   `src/data/activity-education.json`.
2. **Offline generation, committed artifact.** Use an LLM generation script once, validate the result,
   and commit the JSON. The app should not call the model at runtime to render descriptions.
3. **Deterministic fallback.** If no API key is available, the generator writes valid conservative
   fallback summaries by activity type/title so builds and tests remain reproducible.
4. **Health education, not medical instruction.** Copy can explain intended benefit and metrics, but
   must not change medication dosing, diagnose conditions, promise outcomes, or replace clinician
   guidance.
5. **Use the same profile everywhere.** Activities tab, calendar detail, Trace, and future chat
   grounding should all read from the same `ActivityEducationProfile` map.
6. **Substitutions explain both sides.** For substituted occurrences, show education for the fallback
   that was scheduled and a short "replaces original action" note so users understand why the content
   differs from the original plan.

## Data model

Add a small presentation-only type:

```ts
export interface ActivityEducationProfile {
  activityId: string;
  oneLine: string;
  whatItDoes: string;
  whyItMatters: string;
  healthFocus: string[];
  expectedSignals: string[];
  memberGuidance: string;
  careTeamNote: string;
  generatedBy?: string;
  generatedAt: string;
}
```

Field intent:

- `oneLine`: <= 120 chars; used in the Activities row and search/autocomplete later.
- `whatItDoes`: 1 sentence explaining the action plainly.
- `whyItMatters`: 1-2 sentences explaining the intended health-plan role.
- `healthFocus`: short tags such as `blood pressure`, `glucose stability`, `cardiorespiratory fitness`,
  `recovery`, `adherence`, `mobility`, `sleep`, `nutrition`.
- `expectedSignals`: metrics or signals the care team may watch, derived from `activity.metrics` and
  not invented freely.
- `memberGuidance`: practical customer-facing note, e.g. "Log completion and symptoms so the care team
  can spot patterns."
- `careTeamNote`: brief reviewer-facing rationale, e.g. "Useful for longitudinal adherence tracking."

Keep profiles separate from schedule occurrences. A scheduled occurrence links to education through:

- scheduled primary: `occurrence.sourceActivityId`
- substituted fallback: `occurrence.effectiveActivityId` for the scheduled action, plus
  `sourceActivityId` for the original
- skipped: `sourceActivityId`

## Generation workflow

Add:

```txt
npm run generate:activity-education
```

Script: `scripts/generate-activity-education.mjs`

Inputs:

- `src/data/activities.json`
- optional existing `src/data/activity-education.json` for stable regeneration/diffing
- optional prompt/run notes from `docs/prompts/023-activity-education.md`

LLM prompt constraints:

- Return strict JSON matching `ActivityEducationProfile[]`.
- Use only each activity's existing fields: title, type, details, facilitator, resources, prep,
  metrics, frequency, and backup relationships.
- Keep copy concise and customer-readable.
- Do not invent medication dose, duration, clinical diagnosis, contraindication, or guaranteed result.
- For medication/supplement actions, emphasize adherence, monitoring, side-effect awareness, and
  care-team review unless the activity title already clearly states the therapeutic target.
- For fitness/therapy, mention training/recovery/mobility intent without prescribing intensity beyond
  the existing activity policy/details.
- For food/nutrition, mention consistency, glucose/energy/satiety support, and logged response rather
  than making disease claims.
- For consultations, explain the review/decision-support purpose.

Fallback generation:

- Use deterministic templates by activity type.
- Include title and metrics.
- Mark `generatedBy: "deterministic-fallback"`.

Validation:

- Exactly one profile per activity id.
- No missing or dangling `activityId`.
- Length caps per field.
- `healthFocus` and `expectedSignals` capped to small arrays.
- Reject phrases such as `cure`, `guarantee`, `diagnose`, `increase dose`, `stop taking`, or any
  generated medication instruction that changes the plan.
- Stable sort by `activityId`.

Record:

- Save the final prompt and generation run metadata in `docs/prompts/023-activity-education.md`.
- Output should include model name only when an LLM was used.

## UI integration

### Activities tab

Current row shape is priority, type, title, frequency, outcome, and resources. Add education without
making the table noisy:

- Desktop:
  - Under the title, show `oneLine` in muted text.
  - Expanded row adds a compact "Health context" section:
    - What it does
    - Why it matters
    - Health focus chips
    - Signals to watch
    - Member guidance
- Mobile:
  - Card header shows title + oneLine.
  - Expanded content mirrors desktop.

### Calendar action detail

When clicking an action item from the calendar/day timeline:

- Show the selected occurrence's timing/status/resource details as today.
- Add an "About this action" block from the education profile.
- For substituted occurrences:
  - "Scheduled fallback" uses `effectiveActivityId` profile.
  - "Original plan" can show the source title and a one-line reason from `occurrence.reason`.
- For skipped occurrences:
  - Show the original action education plus the skip reason/adjustment.

### Trace tab

Add education in a restrained way:

- Candidate rows may show `oneLine` on hover/expand.
- The selected trace header can show the source activity's `oneLine`.
- Do not crowd the failed-constraint list; trace remains a debugging surface.

### Chat grounding after 019

When a context ref includes an activity or occurrence, include the relevant education profile in the
compact grounding payload. This lets chat answer "what is this for?" without hallucinating health
benefits.

## Implementation phases

### Phase 1 - Data contract and generator ✅ DONE

Scope:

- Add `ActivityEducationProfile` type and validator.
- Add `scripts/generate-activity-education.mjs`.
- Add `npm run generate:activity-education`.
- Add `docs/prompts/023-activity-education.md`.
- Generate and commit `src/data/activity-education.json`.
- **(R2)** Populate `occurrence.effectiveActivityId` in `temporal-scheduler.ts` with the chosen
  candidate's id, so substituted occurrences can resolve fallback education. (Update the
  scheduler tests' expectations.)

Verification:

- Generator works with `OPENAI_API_KEY`.
- Generator writes deterministic fallback output without a key.
- Validator fails on missing ids, dangling ids, overlong fields, and unsafe medical phrasing.

### Phase 2 - Activities tab display ✅ DONE

Scope:

- Import education data in the page/server boundary.
- Pass `educationByActivityId` to `AllocatorWorkspace` and `ActivitiesTab`.
- Add one-line summaries to rows.
- Add "Health context" to expanded activity content.

Verification:

- Every primary activity row has a one-line summary.
- Expanded rows show education content without pushing occurrence lists too far down.
- Missing profile falls back to `Activity.details` and logs/flags validation during build.

### Phase 3 - Calendar / Trace detail display (see R1) ✅ DONE

> Implemented per R1's simpler option: clicking a day-timeline action now opens the **Trace tab**
> (`CalendarTab` sets `activeTab:'trace'`), and the "About this action" education lives in the Trace
> tab's new `AboutThisActionPanel` (alongside the existing `SourceActivityPanel`). No separate
> `DayDetail` occurrence panel was added — the Trace is the single occurrence-detail surface.

Scope:

- Pass education data to the calendar + Trace components.
- Add a compact **occurrence detail panel inside `DayDetail`** (shown when an occurrence is selected)
  with timing/status/resources + "About this action"; AND add the same education block to the Trace
  `SourceActivityPanel`. (There is no pre-existing occurrence detail card to extend — see R1.)
- Handle scheduled, substituted, and skipped states explicitly (substituted uses `effectiveActivityId`
  per R2; original via `sourceActivityId` + `occurrence.reason`).
- Keep the dense day-timeline rows clean — education lives in the detail panel, not on every row.
- For bundle rows, show a bundle-level summary first and child education only when expanded.

Verification:

- Clicking a calendar action shows education for the correct scheduled/effective activity.
- Substituted action detail clearly distinguishes fallback education from original plan.
- Skipped action detail still explains the intended action plus why it was not placed.

### Phase 4 - Trace and chat reuse ✅ DONE

Scope:

- Add one-line education to trace headers/candidate expansions.
- Include education profiles in 019 context grounding for selected activity/occurrence refs.
- Let chat answer "what does this do for me?" from the committed education data.

Verification:

- Trace can explain both allocation reason and health-plan purpose.
- Chat answers activity-purpose questions using committed education text, not invented claims.

## Safety and copy rules

- No dosing instructions.
- No "this will cure/prevent/treat" phrasing.
- No diagnosis-specific claims unless already explicit in the activity title/details.
- Avoid overexplaining routine medication names; focus on adherence and care-team monitoring.
- Use "may support", "helps the care team track", "is intended to", and "supports consistency" over
  guaranteed outcome language.
- Keep member-facing copy calm and practical.

## Testing and acceptance

Vitest:

- Education validator covers id completeness, length caps, unsafe phrase rejection, stable sort.
- Profile lookup resolves scheduled, substituted, and skipped occurrences to the expected activity id.
- Fallback generator returns valid profiles for all activity types.

Playwright (canonical suite `tests/drive-acceptance.mjs`, renumbered A10–A13 per R4 — all ✅ passing):

- **A10** ✅ - Activities tab shows a one-line summary under activity titles.
- **A11** ✅ - Expanding an activity shows "Health context" with what/why/focus/signals.
- **A12** ✅ - Clicking a scheduled calendar action opens its Trace with "About this action".
- **A13** ✅ - Clicking a substituted action shows fallback education and original-plan context.

## What this is not

- Not runtime LLM generation.
- Not evidence citation or medical literature search.
- Not clinician-authored treatment changes.
- Not a replacement for scheduler trace/explainability.
- Not a CMS; profiles are generated fixture data for this take-home/demo.

## Success criteria

1. Every activity has validated education metadata.
2. Activity rows are easier to scan because title + one-line purpose are visible.
3. Calendar action details explain both schedule placement and health-plan purpose.
4. Generated copy is conservative, non-prescriptive, and reproducible without an API key.
5. Chat and Trace can reuse the same education source later instead of inventing activity benefits.
