# 015 — LLM prompt/run records (temporal availability + semantic compiler)

Two offline, deterministic-by-default generation steps. Both commit their output as a
fixture so `npm run build` / `npm test` never call the network or need a key; both fall
back to a built-in deterministic result when no `OPENAI_API_KEY` is present.

Model: `gpt-5.3-chat-latest` (OpenAI), `response_format: json_object`.

## 1. Member availability — `npm run generate:availability`

Script: `scripts/generate-availability.mjs`. The LLM designs the recurring weekly
**pattern** only (weekday / weekend / travel-day block lists for sleep/work/commute/meal/
family); the script expands it deterministically across the 92-day window
(2026-06-01..2026-08-31) into `availability.json.memberBusy` (23 groups, ~1006 time
blocks). Overnight sleep is split at 23:59/00:00 so no block crosses midnight. Travel
ranges keep the existing equipment/clinic blocking (the Singapore/Tokyo substitution demo
is preserved). Run output: `pattern source: llm:gpt-5.3-chat-latest`.

Prompt shape (full text in the script): "design a realistic recurring weekly calendar …
return ONLY JSON {weekday, weekendSat, weekendSun, travelDay, meetingHeavyExtra} … category
in {sleep,work,commute,meal,family,travel,personal,clinical,buffer} … split overnight sleep".

## 2. Scheduling semantic hints — `npm run generate:hints`

Script: `scripts/generate-hints.mjs`. The LLM acts as a bounded **semantic compiler**: it
reads the activity catalog (id/type/title/duration/frequency) + member busy-block titles
and emits TYPED hints only — per-activity `temporalPolicy` hints (confidence-scored) and
busy-block classifications. It never returns a schedule. Output committed to
`src/data/scheduling-hints.json` (20 activity policies + 23 busy classifications on the
last run).

Guardrails (deterministic code, not the model, is the authority):
- Hints validate against `isSchedulingSemanticHints` + `validateHintReferences` at the
  build boundary (`page.tsx`); a stale activity/busy-block id throws and breaks the build.
- The scheduler ignores hints below confidence 0.7 and merges policy as
  **explicit `activity.temporalPolicy` > validated hint > `getDefaultTemporalPolicy()`**.
- With the committed hints the schedule is unchanged from the deterministic baseline
  (2900 scheduled / 492 substituted / 166 skipped), i.e. the hints agree with the defaults.

## Reproducibility

`generatedAt` in `scheduling-hints.json` is stamped to a fixed value so re-runs produce a
stable diff; bump it intentionally on regeneration. The model is non-deterministic, so the
committed fixtures are the source of truth — regenerate only deliberately.
