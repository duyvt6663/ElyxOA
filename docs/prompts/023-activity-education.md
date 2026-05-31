# 023 — LLM prompt/run record (activity education profiles)

One offline, deterministic-by-default generation step. It commits its output as a fixture so
`npm run build` / `npm test` never call the network or need a key; it falls back to a built-in
deterministic template when no `OPENAI_API_KEY` is present (or per-id when the LLM is flaky).

Model: `gpt-5.3-chat-latest` (OpenAI), `response_format: json_object`.

## `npm run generate:activity-education`

Script: `scripts/generate-activity-education.mjs`. Reads `src/data/activities.json` (116
records: 102 primary + 14 backup-only — all covered, since substitutions resolve fallback
education to backup activities). For each activity the LLM returns one conservative
`ActivityEducationProfile` (`oneLine` ≤120 chars, `whatItDoes`, `whyItMatters`, `healthFocus`,
`expectedSignals`, `memberGuidance`, `careTeamNote`). Output committed to
`src/data/activity-education.json`, sorted by `activityId`, `generatedAt` stamped to the fixed
literal `2026-06-01T00:00:00Z` for reproducible diffs.

### Batching

Activities are sent in batches of **24** (~5 calls) to keep each JSON response small and
reliable. Each returned entry is matched back to its activity by exact `activityId`.

### Per-entry robustness / fallback

The app never has a missing or unsafe profile because acceptance is per-id:

- An LLM entry is accepted only if it is well-shaped, within every length cap, has a non-empty
  `healthFocus`, has `expectedSignals` drawn **only** from that activity's own `metrics`
  (invented signals are dropped), and passes the safety filter. Accepted entries are stamped
  `generatedBy: "gpt-5.3-chat-latest"`.
- Any id the LLM omits, returns badly, or phrases unsafely falls back to a **deterministic
  type-based template** (medication / food / fitness / therapy / consultation) that embeds the
  activity title + its metrics as `expectedSignals`, stamped `generatedBy: "deterministic-fallback"`.
- With no API key, every profile is the deterministic template.

The final file therefore always has exactly **116** valid, sorted profiles.

### Safety / copy rules (enforced in BOTH prompt and post-filter)

No dosing instructions; no "cure / guarantee / diagnose / prevent / treat" language; no promised
outcomes; no diagnosis. `expectedSignals` come only from the activity's metrics. Prefer
"may support", "helps the care team track", "is intended to", "supports consistency". The
post-filter shares the `EDUCATION_UNSAFE_PATTERNS` regex list (exported from `src/lib/validate.ts`)
with the validator and the test, so all three reject the same phrasing.

### Prompt (verbatim shape, per batch)

> You write SHORT, conservative health-education copy for a member's health-plan app. For EACH
> activity below, return one profile. Return ONLY JSON `{ "profiles": [ { activityId, oneLine
> (≤120), whatItDoes (1 sentence), whyItMatters (1–2 sentences), healthFocus (1–4 tags),
> expectedSignals (only metric names copied verbatim from this activity's metrics; [] if none),
> memberGuidance, careTeamNote } ] }`.
>
> SAFETY (mandatory — violating copy is discarded): NO dosing instructions; never increase/raise/
> adjust/change/double a dose or stop taking anything. NO "cure", "guarantee", "diagnose",
> "prevent", or "treat" language; no promised outcomes; no diagnosis. Prefer "may support",
> "helps the care team track", "is intended to", "supports consistency". expectedSignals MUST be
> drawn only from the activity's own metrics list. medication/supplement/monitoring → adherence,
> monitoring, side-effect awareness, care-team review. fitness/therapy → training/recovery/mobility
> intent without prescribing intensity. food → consistency, energy/satiety/glucose support, logged
> response, no disease claims. consultation → review / decision-support / plan-update purpose.
> Use the EXACT activityId for each entry.
>
> Followed by the batch lines: `id | type | title | facilitator | metrics: [...] | freq: count/period`.

### Run record (2026-06-01)

- Model: `gpt-5.3-chat-latest`, batch size 24, fixed `generatedAt` `2026-06-01T00:00:00Z`.
- Result: **116 profiles — 114 LLM, 2 deterministic-fallback** (`act-035`, `act-069`: the LLM
  returned an empty/unusable `healthFocus`, so the per-id template covered them).
- Re-validation via `validateEducationProfiles`: **0 errors** (complete, sorted, safe, caps OK).
