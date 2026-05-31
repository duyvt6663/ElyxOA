# 015 - Temporal Availability, Scheduling Semantics, and Calendar Presentation

## Goal
Upgrade the allocator from a whole-day, priority-only planner into a time-aware schedule
that respects realistic member availability, temporal action rules, and a clearer UI for
seeing health actions interleaved with the member's occupied time.

This plan responds to two gaps:

- `014-workspace-ui-ux-gaps.md` proves the current month grid collapses under the
  116-activity fixture. Daily medications dominate the visible chips, while the useful
  scheduler adaptation events are buried.
- `AvailabilityBundle` currently models the member as available 24/7 except during
  travel. That is not realistic enough for a resource allocator. Work, sleep, meals,
  commute, family blocks, clinician appointments, and recovery buffers should affect
  placement.

## Scope
This is a substantial architecture pass. It should be planned separately from the 014
polish items because it changes the data contract, scheduler behavior, diagnostics, and
Calendar/Resources/Trace presentation.

Recommended V1:

- Keep the scheduler pure and deterministic. No backend, no database, no external calendar
  sync.
- Use an LLM only as an optional **semantic compiler** for messy availability/action
  semantics; do not let it be the final feasibility authority.
- Add local-time scheduling at **30-minute granularity**. Use a default fixture timezone
  plus optional per-block overrides for travel; do not build a full timezone conversion
  engine in V1.
- Add semantic member occupied blocks to `availability.json`.
- Add time placement metadata for activities.
- Schedule activities into `{ date, startTime, endTime }`, not date-only.
- Render occupied blocks alongside scheduled actions, with a toggle to hide occupied blocks.
- Extend diagnostics so Trace explains rejected time slots, not just rejected resources.

Out of scope:

- Real Google/Apple calendar import.
- Multi-member tenancy, practitioner edit permissions, or durable persistence.
- Minute-perfect clinical protocol timing. The goal is believable scheduling behavior and
  explainable constraints, not medical-grade automation.
- An LLM-only scheduler. The final schedule must be reproducible from typed inputs and
  deterministic code.

## Review Decisions (2026-05-31)

These decisions resolve the main implementation ambiguities raised during plan review.

1. **Deploy before rewrite.**
   015 should not block 008. Ship the current accepted product first, then treat 015 as
   a v1.1 robustness pass. The backlog should show architectural thinking, but the
   reviewer still needs a hosted URL.

2. **Preserve the existing travel-adaptation story.**
   The current Singapore and Tokyo trips intentionally create visible substitutions and
   skips. 015 must preserve that story. During travel, member free time may exist for
   remote/no-resource actions, but Elyx physical equipment, in-person clinic actions,
   and non-travel-local specialists remain unavailable unless the fixture explicitly
   provisions a travel-local resource. This keeps the original travel substitutions
   visible while making the member's day more realistic.

3. **Use per-block timezone overrides.**
   `AvailabilityBundle.timeZone` is the default/home timezone. `TimeBlock.timeZone?`
   may override it for travel-local blocks. Breakfast in Tokyo is represented as
   `07:30` with `timeZone: 'Asia/Tokyo'`; ordinary home blocks inherit the bundle
   timezone. V1 does not need full timezone conversion in the UI, but the data contract
   must express which local clock a block uses.

4. **Generate broad candidates, then score.**
   Candidate generation should start from waking-hour 30-minute slots, then boost/penalize
   preferred windows. Do not generate candidates only from preferred windows; otherwise
   "outside preferred window" scoring and explanations are dead code.

5. **Resolve anchors deterministically.**
   `anchor: 'breakfast'` resolves to the first `memberBusy` block on that date where
   `category === 'meal'`, title includes `breakfast` case-insensitively, and start time
   is before 11:00. If absent, fallback to 07:30-08:00. Lunch/dinner/bedtime follow the
   same pattern with fixed fallback windows.

6. **Make hints fail loudly when stale.**
   Any committed `scheduling-hints.json` must be validated against current activity IDs,
   busy-block IDs, role vocabulary, and temporal rule schema. Dangling references fail
   `npm test` and should fail the build-time fixture validation. Add
   `npm run generate:hints` for the optional OpenAI/Gemini regeneration path, gated on
   `OPENAI_API_KEY` or `GEMINI_API_KEY`; deterministic fallback remains the default.

7. **Keep 014's cheap density fix decoupled.**
   If 015 is not implemented immediately, still fix 014 #1 with the small month-view
   polish: sort visible chips by status and collapse same-day medication/monitoring
   summaries. Do not make the reviewer wait for the full temporal rewrite to avoid the
   chip blowout.

8. **Practitioner edits are validated, not blindly accepted.**
   If a future practitioner drags an event, the app should preview feasibility. Feasible
   drops become locked/manual placements; infeasible drops show the violated constraints
   and offer "force anyway" only as an explicit out-of-scope future mode. V1 can skip
   drag/drop, but this rule sets the product direction.

9. **Success must be measurable.**
   015 is done only if the observable wins in "Definition of Done" pass, including no
   overlaps, medication/sport spacing, preserved travel adaptation, and reduced visible
   month-cell density.

## Current Problems

1. **Member availability is under-modeled.**
   Travel blocks make whole days unavailable, but ordinary occupied time does not exist.
   The allocator can place anything on any non-travel day, which makes the schedule feel
   fake once the data set is realistic.

2. **The scheduler has no time dimension.**
   `ScheduledOccurrence` has only `date`; resource capacity is one booking per resource per
   day. This prevents overlap checks, action sequencing, meal anchors, and buffers.

3. **Priority dominates longitudinal realism.**
   High-priority daily activities expand across every day and consume the visible calendar
   surface. Weekly/monthly actions are placed by fixed weekday/month rules rather than by
   available windows, spacing, or temporal fit.

4. **Diagnostics explain resource feasibility, not temporal placement.**
   The Trace tab can explain "cardiologist unavailable" or "treadmill blocked", but not
   "09:00 rejected because member is in a work block" or "medication moved to breakfast
   because 08:30 follows high-intensity training too closely."

5. **UI does not show the allocator's real problem.**
   The user needs to inspect actions interleaved with occupied slots. The current calendar
   shows only actions, so the most important scheduling input is invisible.

## Data Contract Changes

### New Time Types

Add local-time types to `src/lib/types.ts`:

```ts
export type LocalTime = `${number}${number}:${number}${number}`;

export interface TimeBlock {
  date: string;        // YYYY-MM-DD
  startTime: LocalTime;
  endTime: LocalTime;
  timeZone?: string;   // defaults to AvailabilityBundle.timeZone
}
```

Use local wall-clock time. `AvailabilityBundle.timeZone` is the default/home timezone;
travel-local blocks can override it with `TimeBlock.timeZone`. The scheduler compares
blocks only within the same date/timezone context in V1; no cross-timezone conversion
is required for the demo. `TimeBlock` does not cross midnight; split overnight sleep into
two blocks (`22:30-23:59` and `00:00-06:30`) so overlap math stays simple. Use `23:59`
rather than `24:00` — the template literal type technically matches `24:00` but string
comparisons (`startTime < endTime`) will misbehave; the validator should explicitly reject
`hh > 23` or `mm > 59`.

### Member Availability

Extend `AvailabilityBundle`:

```ts
export interface MemberBusyBlock {
  id: string;
  title: string;
  category:
    | 'sleep'
    | 'work'
    | 'commute'
    | 'meal'
    | 'family'
    | 'travel'
    | 'personal'
    | 'clinical'
    | 'buffer';
  blocks: TimeBlock[];
  blocksScheduling: boolean;
  visibleByDefault: boolean;
}

export interface AvailabilityBundle {
  windowStart: string;
  windowEnd: string;
  timeZone: string;
  memberBusy: MemberBusyBlock[];
  travel: TravelPlan[];
  equipment: EquipmentAvailability[];
  specialists: SpecialistAvailability[];
  alliedHealth: AlliedHealthAvailability[];
}
```

Semantics:

- `blocksScheduling: true` means scheduled actions cannot overlap the block.
- `visibleByDefault: true` means the UI includes it when "Show occupied slots" is enabled.
- Sleep, work, commute, family, and travel should block scheduling.
- Meal blocks may block most actions but can anchor `withMeal` medication/food actions.
- Buffer blocks are generated or fixture-authored padding around high-friction events.

### Activity Temporal Policy

Add optional temporal metadata to `Activity`. Keep it compact so 116 records remain
maintainable:

```ts
export interface ActivityTemporalPolicy {
  preferredWindows: TimeBlockPreference[];
  anchor?: 'wake' | 'breakfast' | 'lunch' | 'dinner' | 'bedtime' | 'any';
  intensity?: 'none' | 'low' | 'moderate' | 'high';
  minGapBeforeMinutes?: number;
  minGapAfterMinutes?: number;
  avoidAfter?: TemporalAvoidRule[];
  avoidBefore?: TemporalAvoidRule[];
}

export interface TimeBlockPreference {
  label: 'morning' | 'midday' | 'afternoon' | 'evening';
  startTime: LocalTime;
  endTime: LocalTime;
}

export interface TemporalAvoidRule {
  activityType?: ActivityType;
  intensity?: 'moderate' | 'high';
  category?: MemberBusyBlock['category'];
  withinMinutes: number;
  reason: string;
}
```

### Deterministic Default Policy Compiler

Do **not** hand-author `temporalPolicy` on all 116 activities — that is ~600 manual JSON
fields. Instead, implement a `getDefaultTemporalPolicy` function as a first-class
implementation step (Task 2a, before fixture authoring):

```ts
function getDefaultTemporalPolicy(activity: Activity): ActivityTemporalPolicy
```

Key on `activity.type` first, then pattern-match `activity.title.toLowerCase()` for
overrides within the type. Examples:

| Match | Result |
|---|---|
| `type === 'medication'` | `anchor: 'breakfast'`, preferred 07:00-09:00 |
| `type === 'medication'` + title includes `evening` or `night` | `anchor: 'dinner'`, preferred 19:00-21:00 |
| `type === 'fitness'` + title includes `vo2`, `hiit`, `sprint`, `interval` | `intensity: 'high'`, preferred 07:00-11:00 or 16:00-18:30 |
| `type === 'fitness'` + title includes `mobility`, `stretch`, `foam` | `intensity: 'low'`, preferred any |
| `type === 'food'` | `anchor: 'lunch'` or infer from title (`breakfast`/`lunch`/`dinner`) |
| `type === 'therapy'` + title includes `downshift`, `sleep`, `breath`, `sauna` | `anchor: 'bedtime'`, preferred 20:30-22:00 |
| `type === 'therapy'` + title includes `contrast`, `ice`, `cryo` | prefer post-fitness slot, min 30-min gap after |
| `type === 'consultation'` | preferred 09:00-17:00 (business hours) |
| fallback | `intensity: 'none'`, `anchor: 'any'`, preferred 08:00-20:00 |

The fixture only needs explicit `temporalPolicy` overrides on the ~10 activities that
matter for the demo (Morning BP, the high-intensity fitness used to engineer the conflict,
downshift therapy). All other 106 activities inherit from this function. Policy merge
order: explicit fixture field > this function's output.

### Recommended fixture defaults (applies where no explicit override exists)

- Morning medications: `anchor: 'breakfast'`, preferred 07:00-09:00.
- BP readings: preferred 06:30-08:30, avoid after fitness within 120 minutes.
- High-intensity fitness: preferred 07:00-11:00 or 16:00-18:30, avoid within 90 minutes
  after meals.
- Sleep/downshift therapy: preferred 20:30-22:00, avoid after high-intensity fitness
  within 120 minutes.
- Recovery therapy: can follow high-intensity fitness after a 30-90 minute buffer.
- Consultations: preferred business hours, require clinician/resource availability.

Do **not** include `maxPerDay` in V1. Frequency controls occurrence generation; scoring
can penalize overloaded days, and UI summarization can collapse low-risk daily actions
without dropping scheduled work.

`endTime` is derived, not authored: `endTime = startTime + durationMinutes`, rounded up
to the next 30-minute boundary for ledger occupancy. The displayed duration can still
show the exact `durationMinutes`.

### Scheduled Occurrence Time Fields

Extend `ScheduledOccurrence`:

```ts
export interface ScheduledOccurrence {
  date: string;
  startTime?: LocalTime;
  endTime?: LocalTime;
  timeZone?: string;
  // existing fields...
}
```

Scheduled/substituted occurrences must include `startTime`, `endTime`, and `timeZone`.
Skipped occurrences may omit them, but diagnostics should still include the rejected
candidate dates/times.

## Fixture Data Plan

Update `src/data/availability.json` with realistic member availability:

- Daily sleep: 22:30-23:59 (night 1) + 00:00-06:30 (morning); split to avoid midnight crossing.
- Weekday work blocks: 09:00-12:00 and 13:00-17:30, with selected meeting-heavy days.
- Commute/personal logistics: 08:30-09:00 and 17:30-18:15 on office days.
- Meal anchors: breakfast 07:30-08:00, lunch 12:15-13:00, dinner 19:00-19:45.
- Family/personal blocks: 18:30-20:00 on selected weekdays, longer weekend blocks.
- Travel days: convert existing travel ranges into occupied blocks with flight/hotel
  constraints, but preserve the current demo: Elyx physical equipment and in-person
  clinic resources remain blocked during travel unless an explicit travel-local resource
  is provisioned.
- Clinical fixed blocks: lab draw, existing specialist appointment holds, recovery suite
  maintenance if needed.

**Engineered demo conflict (required — do not leave to chance):**
Pick a concrete day where the Reviewer Demo Moment is guaranteed. Recommended: `2026-06-03`
(a weekday, no other engineered conflict). Author the fixture so:
1. Commute block is `08:30-09:00`.
2. An early high-intensity fitness session (`act-XXX`) is already committed at `07:00-08:00`
   by queue priority.
3. Morning BP reading (`act-YYY`, `anchor: 'breakfast'`, preferred `06:30-08:30`,
   `avoidAfter: [{activityType: 'fitness', intensity: 'high', withinMinutes: 120}]`)
   cannot take `06:30` (too early — waking), `07:00` (fitness blocks it), `07:30` (still
   within 120-min gap), `08:00` (commute), `08:30` (commute ends but gap rule still
   active). Earliest feasible slot is `09:00` (commute cleared + 120-min gap from 07:00
   fitness satisfied at 09:00).
4. The Trace tab for this occurrence should show: "06:30 rejected: outside waking hours /
   07:00-08:30 rejected: high-intensity fitness within 120-min gap / 08:00-08:30 rejected:
   commute overlap / 09:00 chosen (score: N)."
The activity IDs in steps 2-3 must be real IDs from the committed fixture; update this
doc when they're confirmed.

Do **not** hand-author `temporalPolicy` on every activity — the `getDefaultTemporalPolicy`
compiler (above) derives policy from `type` + title for all 116 records. `activities.json`
gains an explicit `temporalPolicy` only on the ~10 demo-critical activities (Morning BP, the
engineered high-intensity fitness, downshift therapy). The compiler owns the type-level
defaults the bullets below describe:

- All daily medications and monitoring actions get anchors (compiler default).
- Fitness gets intensity and preferred windows (compiler default).
- Food activities get meal anchors (compiler default).
- Therapy gets recovery/downshift semantics (compiler default).
- Consultations get business-hour preferences and resource windows (compiler default).

The fixture tests should assert:

- At least 90 days have sleep blocks.
- At least 50 weekday work blocks exist.
- Meal anchors exist on most days.
- Every primary activity has a temporal policy or inherits a tested default.
- The generated schedule has no overlaps between actions and blocking busy blocks.

## LLM-Assisted Semantic Compiler

The LLM can make this easier, but its role should be bounded. Use it to translate
ambiguous human/calendar semantics into structured hints; use deterministic code to
validate, score, and commit the schedule.

### Recommended Architecture

Three stages:

1. **Semantic compile (LLM-assisted, optional)**
   - Input: activities, availability, member busy blocks, imported/free-text calendar
     labels, and known role vocabulary.
   - Output: typed hints only: activity temporal policies, busy-block categories,
     anchor relationships, soft preferences, and explanations.
   - No final schedule is accepted from the model.

2. **Deterministic schedule (required)**
   - Input: canonical activities, availability, and validated semantic hints.
   - Output: `ScheduleResult` and `ScheduleDiagnostics`.
   - Owns all hard constraints, overlap checks, resource capacity, and tie-breaking.

3. **Explain and navigate (LLM-assisted, already aligned with 013)**
   - Input: selected occurrence, diagnostics, busy blocks, temporal policies.
   - Output: natural-language explanation and workspace links.
   - Does not mutate schedule state in V1.

This keeps the hard part explainable: the LLM helps classify messy semantics, but every
scheduled event can still be traced to deterministic feasibility and scoring.

### Semantic Hint Contract

Add a sibling structure rather than bloating `Activity` immediately:

```ts
export interface SchedulingSemanticHints {
  generatedAt: string;
  model?: string;
  activityPolicies: ActivityTemporalPolicyHint[];
  busyBlockClassifications: BusyBlockClassification[];
  globalRules: TemporalRuleHint[];
  warnings: SemanticWarning[];
}

export interface ActivityTemporalPolicyHint {
  activityId: string;
  temporalPolicy: ActivityTemporalPolicy;
  confidence: number; // 0..1
  rationale: string;
}

export interface BusyBlockClassification {
  busyBlockId: string;
  category: MemberBusyBlock['category'];
  blocksScheduling: boolean;
  visibleByDefault: boolean;
  confidence: number;
  rationale: string;
}

export interface TemporalRuleHint {
  id: string;
  appliesToActivityIds: string[];
  hard: boolean;
  avoidAfter?: TemporalAvoidRule[];
  avoidBefore?: TemporalAvoidRule[];
  rationale: string;
}

export interface SemanticWarning {
  severity: 'info' | 'warning' | 'error';
  targetId?: string;
  message: string;
}
```

V1 storage options:

- `src/data/scheduling-hints.json` committed as a generated fixture.
- Or compute hints during import in the browser/API path and keep them in workspace state.

Recommended default for the take-home: commit `scheduling-hints.json` so the demo remains
deterministic and buildable without an LLM call. The existing chat can still use live LLM
for explanation.

### What the LLM Should Infer

Good LLM tasks:

- Map noisy event titles like "Board prep", "Flight to SIN", "Kids dinner", "Hotel gym"
  into busy-block categories and blocking semantics.
- Infer that "Morning Antihypertensive" is breakfast/morning anchored.
- Infer that BP readings should happen before exercise/caffeine/meal blocks.
- Infer activity intensity from titles/details: mobility = low, VO2 primer = high,
  sauna/downshift = recovery.
- Infer candidate windows from human text: "after work", "with dinner", "before bed",
  "clinic hours", "hotel only".
- Flag contradictions, e.g. "daily in-clinic activity" with no realistic clinic windows.

Bad LLM tasks:

- Deciding final slot placement without deterministic validation.
- Resolving resource capacity conflicts.
- Silently inventing availability.
- Overriding explicit hard constraints from JSON.

### Guardrails

- Validate LLM output with strict type guards before use.
- Validate all `activityId`, `busyBlockId`, role, and rule references against the current
  fixtures. Dangling hint references fail `npm test`; build-time fixture validation should
  fail before rendering a stale schedule.
- Reject or ignore hints below a confidence threshold, e.g. `< 0.7`.
- Treat LLM hints as **soft defaults** unless a rule is explicitly whitelisted by code.
- Store model name and prompt version in the hint file for reproducibility.
- Never feed raw prompt-injection-prone calendar text directly into the chat system prompt;
  normalize it as data and quote it as untrusted user content.
- Add a deterministic fallback policy compiler so the scheduler still works when no API key
  is available.
- Add `npm run generate:hints` as the explicit regeneration path. It may call OpenAI or
  Gemini when the corresponding API key is present, but normal `npm test` / `npm run build`
  must not require network or credentials.

### Hybrid Scheduling Algorithm

The temporal scheduler should consume hints like this:

1. Load canonical activities and availability.
2. Load or generate `SchedulingSemanticHints`.
3. Validate hints.
4. Merge policies:
   - explicit activity `temporalPolicy` wins
   - validated hint policy second
   - deterministic type/title defaults last
5. Generate candidate slots from merged policy.
6. Apply hard deterministic constraints.
7. Score soft preferences, including LLM-derived hints.
8. Commit the lowest-scoring feasible slot.
9. Record whether each score/constraint came from explicit data, deterministic defaults,
   or LLM hints.

Diagnostics should show provenance:

- `source: 'explicit' | 'default' | 'llm-hint'`
- hint confidence when relevant
- rationale string for LLM-derived policy

This gives reviewers a stronger story: the app can handle fuzzy real-world inputs, but it
does not become a black-box LLM scheduler.

## Scheduler Algorithm Plan

Replace the date-only allocation loop with a deterministic temporal allocator.

### Phase 1: Expand Due Work

Keep frequency expansion, but treat the output as due-date candidates rather than final
placement. For weekly/monthly actions, allow limited movement inside a placement window:

- Daily: same day only.
- Weekly: same ISO week, prefer original weekday but allow +/- 2 days.
- Monthly: same month, prefer generated day but allow nearby available days.
- Yearly: entire scheduling window, prefer earliest feasible slot.

This is the longitudinal fix: the scheduler can spread work across real availability
instead of pinning everything to Monday or day 1.

### Phase 2: Generate Candidate Slots

For each due activity:

1. Build candidate days from the movement window.
2. Build candidate start times from the day's waking/free horizon, typically 06:00-22:30,
   snapped to 30-minute intervals.
3. Snap to 30-minute boundaries.
4. Mark whether each candidate is inside `temporalPolicy.preferredWindows` or near an
   anchor; do not drop it just because it is outside the preferred window.
5. Drop candidates outside member waking hours unless the activity explicitly allows it.
6. Drop candidates that overlap blocking `memberBusy`.
7. Drop candidates that violate resource availability/capacity. During travel, physical
   Elyx equipment and in-person clinic resources are unavailable unless a travel-local
   resource is explicitly present.
8. Drop candidates that violate hard temporal rules.

### Phase 3: Score Feasible Slots

Use deterministic scoring instead of "first feasible wins":

- Lower score is better.
- Hard constraints eliminate a slot.
- Soft penalties:
  - moved from generated date: +6 per day
  - outside preferred window: +18
  - same-day overload: +3 per already scheduled health action
  - too close to meal but not hard-blocked: +10
  - late evening for stimulating activity: +15
  - breaks weekly spacing: +10
  - uses backup instead of primary: +12

Tie-break deterministically by `(score, priority, date, startTime, activityId)`.

Put these in a named config object, e.g. `TEMPORAL_SCORE_WEIGHTS`, with comments. The
weights intentionally make "preferred-window backup" (+12) better than "outside-window
primary" (+18), because preserving timing can be more useful than preserving the exact
modality when a same-type backup exists. Priority still controls allocation queue order;
score chooses the best slot/candidate for the activity currently being allocated. A
lower-priority activity must not steal a contested slot from a higher-priority activity
just because its score would be better.

### Phase 4: Allocate with Backups

For each activity occurrence:

1. Try primary candidate slots.
2. If no primary slot is feasible, try backups.
3. Commit chosen slot to:
   - action ledger: member occupied time
   - resource ledger: resource occupied time
   - diagnostics trace
4. If no slot works, emit skipped occurrence with failed temporal/resource reasons.

Recommended queue order:

1. Fixed-anchor medications/monitoring.
2. Clinician/resource-constrained consultations and therapies.
3. High-intensity fitness.
4. Food habits and flexible daily actions.
5. Low-intensity recovery/mobility.

**Tier vs. priority interaction:** tiers determine the outer sort; within a tier, sort by
`activity.priority` ascending (lower number = higher priority). An activity in tier 3
(fitness) with `priority: 1` does NOT pre-empt a tier-1 (medications) activity —
tier membership is fixed by temporal-rigidity classification, not by `priority` field.
`priority` only breaks ties within a tier. This ensures that a high-priority fitness
activity does not consume the morning slots needed by anchored medications before the
medication pass runs.

**Action ledger:** maintain a `Map<string, TimeBlock[]>` keyed by date (`YYYY-MM-DD`).
When a slot is committed, push its `TimeBlock` onto that date's list. Candidate
feasibility in Phase 2 checks whether the new candidate overlaps any existing block in
the ledger for that date. Resource and action ledgers are both consulted; they are kept
separate structures.

## Simple Temporal Rules for V1

Implement these first; they are easy to explain and test:

1. **No overlap:** scheduled actions cannot overlap blocking member busy blocks or other
   scheduled actions.
2. **Medication after sport rule:** medication/monitoring actions with breakfast/morning
   anchors cannot be placed within 90 minutes after moderate/high-intensity fitness.
3. **BP/glucose monitoring rule:** BP and CGM checks should happen before caffeine, meals,
   or fitness when possible; after fitness within 120 minutes is a hard failure for BP.
4. **Meal proximity rule:** high-intensity fitness cannot start within 90 minutes after a
   meal block.
5. **Sleep protection rule:** high-intensity fitness cannot start after 19:00; downshift
   therapy should start after 20:30 and before sleep.
6. **Recovery sequencing rule:** contrast therapy, foam rolling, massage, and breathwork
   should prefer slots after fitness, not before, with at least 30 minutes of buffer.
7. **Consultation business-hours rule:** clinician appointments must be placed between
   09:00 and 17:00 unless the fixture explicitly provides an evening slot.
8. **Daily overload rule:** cap visible scheduled health actions per day by soft score,
   not by dropping actions. The UI can collapse low-risk daily actions, but the scheduler
   still emits them.

Temporal rules must be evaluated bidirectionally against already-scheduled actions and
busy blocks. Example: if BP has "avoid within 120 minutes after high-intensity fitness",
then placing fitness 30 minutes after an existing BP reading should also fail when the
rule intent is "these two should not be near each other." Implement this by compiling
activity policies into normalized pairwise predicates, not by checking only the candidate
activity's `avoidAfter` fields.

## Diagnostics Changes

Extend `AllocationTrace` attempts with candidate slot details:

```ts
export interface AllocationAttempt {
  candidateActivityId: string;
  isPrimary: boolean;
  candidateDate: string;
  candidateStartTime?: LocalTime;
  candidateEndTime?: LocalTime;
  feasible: boolean;
  score?: number;
  failedConstraints: FailedConstraint[];
  boundResources: BoundResource[];
}
```

Extend `FailedConstraint.kind`:

- `memberBusy`
- `actionOverlap`
- `temporalRule`
- `outsidePreferredWindow`
- keep existing `travel`, `equipment`, `specialist`, `alliedHealth`, `remoteRequired`

Trace tab should show:

- Chosen slot and score.
- Rejected candidate times grouped by reason.
- The specific busy block or prior action that caused rejection.
- The temporal rule text, e.g. "BP reading cannot be placed within 120 minutes after
  high-intensity fitness."

Cap trace verbosity so skipped activities do not produce unusable diagnostic walls:

- Store aggregate rejection counts per reason.
- Keep at most 5 example rejected candidates per reason.
- Sort examples by closeness to the preferred/anchor window, then by date/time.
- Keep the chosen candidate untruncated.

## UI / UX Plan

### Calendar Tab

Replace "chip pile per day" as the primary view with two levels:

1. **Month overview**
   - Show compact counts per day: scheduled actions, substitutions, skips, occupied blocks.
   - Always surface skipped/substituted events first.
   - Collapse low-risk daily medication/monitoring into summary chips like `Meds x 7`.
   - Add toggle: `Show occupied slots`.

2. **Day timeline drawer / detail panel**
   - Chronological 06:00-23:00 lane.
   - Busy blocks are neutral gray.
   - Scheduled actions use current type colors.
   - Substituted/skipped actions remain high-emphasis.
   - Toggle hides/shows busy blocks without changing scheduled actions.

### Resources Tab

Add a "Member" resource lane above equipment/specialists/allied health:

- Sleep/work/travel blocks as occupied intervals.
- Scheduled actions as overlays.
- Same `Show occupied slots` toggle applies here.
- Date-axis labels from 014 #3 should be included.

### Priority Queue

Add time-aware outcome fields:

- scheduled in preferred window
- scheduled outside preferred window
- substituted
- skipped
- moved from generated date

This helps debug longitudinal quality, not just outcome status.

### Allocation Trace

Make temporal reasoning first-class:

- Selected occurrence shows final time slot.
- Candidate rejection table includes member busy and temporal-rule failures.
- "Show nearest feasible alternatives" can list the next 3 candidate slots rejected by
  soft score. This is optional; do not implement before basic trace clarity.

### Chat

Ground chat with busy blocks and temporal rules:

- "Why was this moved to 18:30?"
- "What blocked Monday morning?"
- "Hide occupied slots"
- "Show medication timing conflicts"

**Grounding payload slice:** include only the busy blocks whose date falls within
`[occurrence.date - 1 day, occurrence.date + 1 day]` (3 days max). Do not send all
92 days of busy blocks — at 5+ blocks/day that is 460+ entries and will exceed the
context window. For temporal rules, send only the rules that apply to the selected
activity's type + the types of activities already scheduled on that date. The existing
`scheduleSummary` truncation strategy (from 013) still applies.

Do not let chat mutate the schedule in V1. It can navigate tabs and explain.

### Reviewer Demo Moment

The 5-minute demo should have one obvious win:

1. Open a day timeline.
2. Show work/commute/meal occupied blocks interleaved with scheduled health actions.
3. Select a medication or monitoring action that moved from its preferred time.
4. Trace explains: "07:30 was rejected because it overlapped commute / was too close to
   high-intensity fitness; 08:30 was chosen as the nearest feasible breakfast-window slot."

This makes the rewrite legible: the user sees the member's real day, the allocator's
choice, and the explanation in one flow.

## Tests and Acceptance Criteria

### Unit Tests

Add tests for:

- member busy block validation
- no action overlaps a blocking busy block
- no two scheduled actions overlap for the member
- medication is not placed shortly after high-intensity fitness
- bidirectional temporal rules reject both "medication after sport" and the inverse
  ordering when the rule is intended as a proximity ban
- high-intensity fitness is not placed shortly after a meal
- consultation lands inside business/resource windows
- weekly actions spread across feasible days when the preferred day is blocked
- diagnostics record rejected candidate slots and temporal rule failures

### Fixture Tests

Add tests for:

- realistic member availability density
- activity temporal policy coverage
- schedule includes all three event categories: action, busy, resource constraint
- hidden busy blocks do not disappear from scheduling constraints
- LLM semantic hints validate against schema and low-confidence hints are ignored
- deterministic fallback policies produce a valid schedule without an API key
- stale hint references fail validation
- travel windows preserve the original substitution/skip demo intent

### Playwright Checks

Add checks for:

- Calendar month view shows action summaries instead of medication chip blowout, with
  visible rendered chip elements per day-cell <= 8 when occupied slots are collapsed.
  "Visible chip elements" counts each distinct DOM chip node (including summary chips like
  `Meds × 7` as **1** and a "+N more" button as **1**); it does not count the collapsed
  medications behind the summary. The Playwright assertion target is
  `[data-testid="day-cell-chips"] > *` or equivalent, capped to the rendered node count.
- Toggle hides occupied slots in the day timeline.
- Toggle re-shows occupied slots without changing selected action.
- Trace for a medication-after-sport conflict shows `temporalRule`.
- Resources tab shows the Member lane plus existing resource lanes.
- Chat can answer "What blocked this time?" using selected occurrence context.

## Implementation Tasks

1. **Data contract**
   - Add `LocalTime`, `TimeBlock`, `MemberBusyBlock`, `ActivityTemporalPolicy`, and
     time fields on `ScheduledOccurrence`.
   - Update validators.
   - Verify: `npm test` type/guard tests pass.

2. **Fixture generation**
   - Update `availability.json` with realistic member busy blocks.
   - Add `temporalPolicy` to activities or implement deterministic policy defaults plus
     explicit overrides.
   - Verify: fixture integrity tests pass.

3. **LLM semantic compiler**
   - Add a prompt + typed parser for generating `SchedulingSemanticHints`.
   - Add a committed `src/data/scheduling-hints.json` fixture or a deterministic
     fallback compiler if no hints are present.
   - Add strict validators for hint references and `npm run generate:hints` for explicit
     API-backed regeneration.
   - Verify: invalid/low-confidence hints are ignored and no API key is required for
     `npm run build`.

4. **Temporal scheduler**
   - Add candidate-slot generation, temporal feasibility, scoring, and member/action
     ledgers.
   - Keep `schedule(...)` pure and deterministic.
   - Verify: old status-level tests still pass where semantics remain relevant; new
     temporal tests pass.

5. **Diagnostics**
   - Extend traces with candidate times, scores, and temporal failures.
   - Include provenance for explicit/default/LLM-derived rules.
   - Verify: Trace tests assert rejected slots and chosen slot details.

6. **Calendar UI**
   - Replace dense chip stack with summarized month cells and chronological day timeline.
   - Add `Show occupied slots` toggle.
   - Verify: desktop and mobile Playwright screenshots show no chip blowout.

7. **Resources / Priority / Trace UI**
   - Add Member lane to Resources.
   - Add time-aware outcome metrics to Priority.
   - Update Trace to explain temporal placement.
   - Verify: Playwright checks pass.

8. **Chat grounding**
   - Extend grounding payload with selected busy blocks, temporal policies, chosen slot,
     and failed temporal constraints.
   - Verify: LLM answer cites the selected occurrence and temporal reason.

9. **Docs**
   - Update `docs/context/index.md`.
   - Update `docs/prompts/004-availability.md` and any activity fixture prompt/run record.
   - Add prompt/run record for the semantic compiler.
   - Note how 015 supersedes the calendar-density portion of 014.

## Suggested Iteration Order

0. Ship 008 deploy for the current product. 015 must not block the hosted submission.
1. If 015 is not starting immediately, do 014 #1 as a small polish patch: status-first
   chip sort + medication/monitoring collapse in the month grid.
2. Data contract and validators.
3. Realistic member availability fixture that preserves travel adaptation.
4. Deterministic temporal-policy defaults.
5. Optional LLM semantic compiler + committed hints fixture + `generate:hints` script.
6. Temporal scheduler core with 30-minute slots.
7. Diagnostics extension with rule provenance and capped candidate examples.
8. Calendar timeline UI and occupied-slot toggle.
9. Resources/Trace/Priority refinements.
10. Chat grounding.
11. Playwright acceptance and docs.

## Risks / Tradeoffs

- **Bigger blast radius:** this touches types, data, scheduler, diagnostics, UI, and chat.
  Treat it as a dedicated implementation branch, not a polish patch.
- **Fixture size:** member busy blocks over 92 days can grow large. Prefer recurring
  generation in a prompt/script only if static JSON becomes unreadable; otherwise keep
  committed JSON as the source of truth.
- **Algorithm complexity:** do not jump to full constraint solving. A deterministic scored
  greedy allocator with clear diagnostics is enough for the take-home and easier to defend.
- **LLM non-determinism:** keep LLM calls outside the final allocation loop. Commit validated
  hints or provide a deterministic fallback so builds/tests are reproducible.
- **Backward compatibility:** existing imports and tests expect date-only occurrences.
  Migration should update tests deliberately instead of preserving date-only behavior via
  hidden defaults.

## Definition of Done

- 008 deploy remains unblocked; 015 is not required for the initial hosted submission.
- Schedule output includes `startTime` and `endTime` for scheduled/substituted actions.
- No scheduled action overlaps blocking member busy time.
- No two scheduled health actions overlap each other.
- At least one test proves a medication/monitoring action is not placed shortly after
  a sport/high-intensity slot.
- Travel windows still produce visible substitutions/skips equivalent to the current
  engineered demo story; at minimum, Singapore/Tokyo travel-week adaptations remain
  visible in Calendar/Trace acceptance checks.
- Month view visible items per day drop from the current dense chip blowout to <= 8 when
  occupied slots are collapsed.
- Stale `scheduling-hints.json` references fail validation.
- Calendar day detail shows actions interleaved with occupied member slots.
- User can hide/show occupied slots.
- Trace explains temporal placement and rejected candidate slots.
- `npm test`, `npm run build`, and Playwright smoke/acceptance pass.
