# 012 - Scheduler Diagnostics (AllocationTrace)

## Goal
Give the scheduler first-class explainability. Today `ScheduledOccurrence.reason` is a
single human-readable string ("substituted: act-bk — primary blocked (no available
equipment for role treadmill)") — the UI cannot show the ordered constraint checks, which
backup candidates were tried, what each backup failed on, or which resources were bound
in which alternative. This file adds an **`AllocationTrace`** structure recording the
full attempt chain per (activity, date) slot.

This is a pure backend/data change — no UI, no chat. UI consumers (013's Allocation Trace
tab and chat answers) read traces but don't write them.

## Why a separate plan

The teammate's review (010 §24) identified that `reason` is "the UI can show what happened,
but not why; one string can't express the ordered constraint checks." Without a
machine-readable trace:
- 013's `Allocation Trace` tab is a guess from the reason string.
- Chat answers ("why was Jun 1 skipped?") must regex-parse `reason` to be specific.
- Acceptance tests cannot assert "the cardiologist was unavailable on this date AND no
  feasible backup existed" — they can only assert the final status.

A typed trace is the right interface for all three.

## Architecture Decisions

- **Decision (locked): full trace per attempt.** Each (activity, date) slot records EVERY
  attempted candidate (primary + each backup walked) with that candidate's feasibility,
  the failed constraints (when blocked), the bound resources (when feasible), and which
  attempt was finally chosen. JSON cost estimated ~50 KB at the 102-activity scale —
  acceptable for a static-bundled site.
- **Sibling, not embedded.** `ScheduleResult.occurrences` STAYS as-is (backwards compatible
  — 010 polish and the Calendar tab keep working unchanged). Diagnostics are emitted as
  a sibling `ScheduleDiagnostics` object, returned together via a new
  `scheduleWithDiagnostics(activities, availability): ScheduleDebugResult`. The existing
  pure `schedule(...)` keeps its signature and continues to call the same internal logic
  — it just discards the trace.
- **Trace records refs, not denormalized data.** Trace stores activity IDs, role strings,
  and resource IDs; UI consumers resolve them through `activitiesById` and the
  availability bundle. Keeps trace JSON compact and avoids two-source-of-truth drift.
- **Deterministic.** Same input → byte-identical trace. Iteration order over availability
  arrays remains the locked left-to-right walk (canon).
- **Validation guard required.** `isAllocationTrace` and `isScheduleDiagnostics` join the
  existing guards in `validate.ts`. Imported diagnostics (from 009's stretch path or
  future tooling) must validate at the boundary.

## Type Definitions (canonical, owned by `@/lib/types`)

```ts
export interface FailedConstraint {
  /** What was checked: travel | equipment | specialist | alliedHealth | remoteRequired */
  kind: 'travel' | 'equipment' | 'specialist' | 'alliedHealth' | 'remoteRequired';
  /** Role or resource that failed (omitted for travel/remoteRequired). */
  role?: string;
  /** Specific resource id that failed (omitted when role-level pool exhausted). */
  resourceId?: string;
  /** Short human-readable explanation (same family as today's reason strings). */
  detail: string;
}

export interface AllocationAttempt {
  /** The activity tried in this attempt (primary or one of the backups). */
  candidateActivityId: string;
  /** Whether the candidate is the source activity (true) or a backup (false). */
  isPrimary: boolean;
  feasible: boolean;
  /** Bound resources if feasible; empty array otherwise. */
  boundResources: BoundResource[];
  /** Failed constraints in the order they were checked. Empty when feasible. */
  failedConstraints: FailedConstraint[];
  /** isRemote + location captured at decision time (when feasible). */
  isRemote?: boolean;
  location?: string;
}

export interface AllocationTrace {
  /** Matches the produced ScheduledOccurrence.id (1:1). */
  occurrenceId: string;
  /** The source activity (the primary that was expanded into this slot). */
  sourceActivityId: string;
  /** Date this slot resolves to. */
  targetDate: string;
  /** Every candidate tried, in order. */
  attempts: AllocationAttempt[];
  /** Index into `attempts` of the chosen candidate, or null if all failed (skipped). */
  chosenIndex: number | null;
  /** Mirror of ScheduledOccurrence.status for convenience. */
  status: ScheduledOccurrence['status'];
}

export interface ScheduleDiagnostics {
  /** windowStart/windowEnd mirror ScheduleResult; redundant but lets the trace stand alone. */
  windowStart: string;
  windowEnd: string;
  traces: AllocationTrace[];
}

export interface ScheduleDebugResult {
  result: ScheduleResult;          // unchanged contract
  diagnostics: ScheduleDiagnostics; // new
}
```

## Scheduler Changes

The existing `schedule(activities, availability): ScheduleResult` keeps its public
signature. Internally:

1. `allocate(slot, ...)` already walks primary → backup chain in order. Today it
   discards intermediate `isFeasible` results once the chosen attempt is found.
   → 012 makes `allocate` record each attempted candidate into a local
   `AllocationAttempt[]` array regardless of outcome.
2. `isFeasible` already returns `{feasible:true, boundResources, isRemote, location}` or
   `{feasible:false, reason}`. → 012 extends the failure branch to emit a structured
   `failedConstraints: FailedConstraint[]` array in addition to (or instead of) the
   single reason string. The single reason becomes a derived join of the constraint
   details so the existing `reason` field on `ScheduledOccurrence` keeps the same shape
   for the Calendar/DayDetail consumers.
3. A new `scheduleWithDiagnostics(activities, availability): ScheduleDebugResult` is
   the diagnostics-enabled entry. Internally it reuses the same expansion + allocation
   machinery but threads a `traces: AllocationTrace[]` accumulator.
4. The original `schedule(...)` becomes `(a, av) => scheduleWithDiagnostics(a, av).result`.
   No public API breakage; consumers that don't need traces don't pay attention.

The per-day exclusive-capacity ledger is unchanged. Tie-breaking is unchanged.

## Tasks

1. **Define the types** in `src/lib/types.ts` per the block above. Preserve existing
   DECISION RECAP / PSEUDO-ALGORITHM headers. → *verify:* `tsc --noEmit` passes; no
   downstream import errors in CalendarView / ImportPanel / scheduler.
2. **Extend `isFeasible` to emit `failedConstraints`** alongside the existing single
   reason. `reason` becomes `failedConstraints.map(f => f.detail).join('; ')` for
   backwards compatibility. → *verify:* existing scheduler and fixture tests still pass
   unchanged; the existing `reason` strings on `ScheduledOccurrence` are byte-identical
   to before.
3. **Implement `scheduleWithDiagnostics`** in `src/lib/scheduler.ts`: same algorithm,
   but accumulate one `AllocationTrace` per slot. Record every `AllocationAttempt`
   including the chosen one. `chosenIndex` is `attempts.findIndex(a => a.feasible)` for
   scheduled/substituted, `null` for skipped. → *verify:* call it on the existing
   fixtures (`src/data/*.json`); `diagnostics.traces.length === result.occurrences.length`.
4. **Refactor `schedule` to delegate**: `(activities, availability) =>
   scheduleWithDiagnostics(activities, availability).result`. → *verify:* `npm test`
   still passes (zero change in result shape).
5. **Add validators** in `src/lib/validate.ts`: `isFailedConstraint`,
   `isAllocationAttempt`, `isAllocationTrace`, `isScheduleDiagnostics`,
   `isScheduleDebugResult`. → *verify:* hand-rolled guards reject obvious mismatches
   in a unit test.
6. **Add new scheduler tests** to `src/lib/scheduler.test.ts` covering:
   - `traces parallel to occurrences`: 1:1 by `occurrenceId`.
   - `chosenIndex points to feasible attempt for scheduled/substituted`.
   - `chosenIndex is null for skipped, attempts.length === 1 + backupIds.length`.
   - `failedConstraints[].kind matches the asymmetric model`: travel block →
     `'travel'`; equipment maintenance → `'equipment'` + role; specialist window miss
     → `'specialist'` + role; allied gap → `'alliedHealth'` + role; canBeRemote=false
     + away → `'remoteRequired'`.
   - `exclusive capacity surfaces in diagnostics`: second priority-2 activity needing
     the same resource shows `{kind:'equipment', role:'cardiologist', detail:'…booked…'}`
     in its trace (or whichever resource).
   → *verify:* `npm test` green with the existing suite plus the new diagnostics tests.
7. **Update `src/lib/types.ts` JSDoc** to mark `ScheduledOccurrence.reason` as "human
   summary; see `ScheduleDiagnostics.traces[].attempts` for structured detail." →
   *verify:* hover tooltip on `reason` in IDE shows the pointer.
8. **Update `src/app/page.tsx`** (or wherever the build-time call is made) to call
   `scheduleWithDiagnostics` and pass the diagnostics through to the workspace as a
   prop alongside `result`. *Note:* 011 doesn't yet consume diagnostics; 011 + 012 can
   land independently — when both are in, 013 ties them together. → *verify:* `npm run build`
   still emits `/` as `○ (Static)`; bundle First Load JS may grow ~10-30 KB with the
   diagnostics payload, watch it.
9. **Measure trace JSON size** on the current 102-primary-activity dataset.
   Document in this file's `Verification` section. → *verify:*
   trace JSON estimate < 100 KB. If real-world exceeds 200 KB,
   flag and consider gating diagnostics behind an env flag in a follow-up.

## Open Questions / Decisions Needed

1. **Should `ScheduleDiagnostics.traces` be sorted alongside `ScheduleResult.occurrences`?**
   *Recommended:* yes — same (date, sourceActivity.priority) ordering. Lets the
   Allocation Trace tab consume them by index without a Map lookup. Costs zero extra
   work since they're generated in lockstep.
2. **Should the existing `reason` string be deprecated in favor of constructing it
   from `failedConstraints[]` at render time?** *Recommended:* keep it. Removing it
   forces 013 UI work; cheap to keep both. Mark as "human summary" in JSDoc.
3. **Production gating: should diagnostics be feature-flagged out of the production
   bundle?** *Recommended:* NO for now — at the 102-activity scale we estimate < 100 KB,
   which is acceptable for the static deploy. Revisit only if the bundle exceeds 200 KB
   or if the reviewer asks about page weight.
4. **`AllocationAttempt.boundResources` for failed attempts**: currently spec'd as
   empty array. Should it list partial bindings (e.g. specialist OK but equipment
   blocked)? *Recommended:* keep empty for failed attempts; `failedConstraints` already
   carries enough detail. Adds noise if we record partials.

## Dependencies & Interfaces

- **To 010:** none. 010's polish doesn't depend on diagnostics.
- **To 011:** none. 011's shell renders without diagnostics; the Allocation Trace tab
  is stubbed.
- **To 013:** 013 reads `diagnostics.traces[i].attempts` to render the Allocation
  Trace tab and to ground chat-answer reasoning. The chat's "why was X skipped?"
  prompt is grounded in trace data, not regex-parsed `reason` strings.

## Verification

- `npm test` 15/15 green (10 unchanged + 5 new trace tests).
- `scheduleWithDiagnostics(activities, availability)` returns a `ScheduleDebugResult`
  with `result.occurrences.length === diagnostics.traces.length`.
- Every `occurrence` in `result.occurrences` has a matching `trace` in
  `diagnostics.traces` with the same `id`/`occurrenceId`.
- For a known engineered scenario (Jun 1 cardio skipped — narrow cardio window
  excludes June): the trace has `attempts.length === 1` (no backup), `attempts[0]
  .feasible === false`, `attempts[0].failedConstraints[0].kind === 'specialist'`,
  `failedConstraints[0].role === 'cardiologist'`.
- For a known engineered scenario (Jul 6 fitness substituted to home backup): the
  trace has `attempts.length === 2`, `attempts[0].feasible === false`,
  `attempts[0].failedConstraints` mentions `'equipment'` + `'treadmill'`,
  `attempts[1].feasible === true`, `chosenIndex === 1`.
- `isAllocationTrace` rejects an attempt-less object; `isScheduleDiagnostics` rejects
  a traces array with non-string occurrenceIds.
- `npm run build` exits 0; `/` still `○ (Static)`; First Load JS bundle growth ≤ +30 KB
  on the current fixture (record actual delta in the PR description).
- Bundle estimate on the 102-primary-activity dataset: trace JSON ≤ 100 KB raw before
  gzip; record actual during the 012 implementation pass.

## What 012 deliberately does NOT do

- Render any UI. The Allocation Trace tab and chat consumers are 013's scope.
- Change the `ScheduledOccurrence` shape or remove `reason`.
- Add an LLM call or any IO. Diagnostics are computed in the same pure function as
  the result.
- Add URL-param sync, persistence, or replay tooling for diagnostics. Out of scope.
