# 026 - Trace-tab overlap explanation

## Source

Reviewer feedback: the calendar/day timeline shows **actions overlapping the member's occupied
blocks** (e.g. a consultation sitting inside the 09:00–12:00 work block, or a pill/BP-log landing
during the commute), and it reads like a scheduling bug. The behavior is intentional, but nothing in
the UI explains *when* an overlap is allowed or *why*. Add a small, contextual explanation in the
**Trace tab** so the "why" is one click away.

Severity: **P2** — not a bug, but a recurring source of reviewer confusion / a credibility ding.

> **Status (2026-06-09):** **V1 implemented & verified** (shared `temporal-classification.ts` + Trace-tab
> note). Not yet deployed — see Implementation result.

---

## Implementation result (V1 — 2026-06-09)

- **`src/lib/temporal-classification.ts`** (new): extracted the 015 "blocking vs quick" rule as
  `isBlockingActivity`, plus `overlapExplanationKind(occ, activityById, policyFor)` →
  `'consultation' | 'quick' | null` — resolves the **effective** placed action and returns `null` for
  skipped occurrences.
- **`temporal-scheduler.ts`** now imports `isBlockingActivity as isBlocking` instead of its own copy —
  **behavior-preserving** (full fixture byte-identical: 3311/200/3, cardiology June-1 skip / A1 intact).
- **`AllocationTraceTab.tsx`** renders a sky-blue info callout above the attempt cards, classified by
  the selected occurrence's effective action: consultation → work-overlap note; quick → point-in-time
  note; blocking / skipped → no note.

**Verified:** `tsc` clean · **vitest 104/104** (+7 in `temporal-classification.test.ts` covering
consultation / quick / low-fitness≥20 / blocking / skipped / substituted-by-effective) ·
`npm run build` static green · 0 console errors. UI spot-checked on a live dev server: the **quick**
note renders for `Outdoor Brisk Walk`, and a 60-min `Lower Body Strength` correctly shows **no** note;
the consultation branch is the same conditional + the unit-tested classifier.

**Follow-up observed (separate from this note):** work-overlapping consultations render *inside* the
work block in the DayTimeline and weren't a simple click target in verification — reaching their Trace
currently needs the Activities tab / chat `selectOccurrence`. A small DayTimeline clickability fix
would let reviewers reach exactly the occurrences this note explains.

---

## Problem

Two kinds of overlap are deliberate (see `src/lib/temporal-scheduler.ts`, `evaluateCandidates` +
`isBlocking`), but the UI presents them with no explanation:

1. **Consultations overlap `work` blocks.** A consultation may be placed inside a work block — the
   member steps out for the appointment. Without this exception, since business hours == work hours,
   *no* clinician appointment could ever be scheduled. This exception is specific to `work`; sleep,
   commute, meals, travel, and other blocking member/action overlaps still block consultations.
2. **Quick (point-in-time) actions coincide with busy blocks and with each other.** Actions that are
   *not* blocking — pills, BP/CGM logs, hydration, short walks, low-intensity mobility — get a placed
   time but don't demand exclusive focus, so they may sit alongside work / commute / meals and
   alongside other actions. ("You can take a pill during your commute.") **Sleep** and explicit
   temporal safety/proximity rules can still block a quick action.

A reviewer looking at the Trace tab for such an occurrence sees a placed time that overlaps something
and has no way to know the overlap is by design.

## Goal

When the Trace tab shows an occurrence whose **class** permits an overlap, render a one- or two-line
plain-language note explaining *what kind* of overlap is allowed and *why*. Keep it simple — it
explains the rule, contextual to the selected occurrence; it is not a per-minute overlap audit.

## Proposed change

In `src/components/workspace/tabs/AllocationTraceTab.tsx`, add a small info callout (info-styled, e.g.
`bg-sky-50 border-sky-200`) near the occurrence header/status — shown **conditionally** by the
selected placed occurrence's activity class:

- **Consultation** → *"Appointments can overlap your work block. Clinicians are only available during
  business hours, so we schedule the appointment during work and assume you step away from your desk.
  Other occupied time still blocks it."*
- **Quick / point-in-time action** (non-blocking) → *"This is a quick, point-in-time action (like a
  pill or a log). It doesn't need focused time, so it can sit alongside your work, commute, meals, or
  other actions. Sleep and explicit safety/proximity rules still block it."*
- **Blocking, non-consultation action** (a focused workout, a therapy session) → **no note** (these
  take exclusive time and never overlap a blocking busy block).
- **Skipped occurrence** → **no note** (nothing was placed, so overlap semantics are irrelevant).

**Classification (already available in the tab).** The tab receives `activities` and resolves the
selected `occ` from `result.occurrences`, so classify the **effective placed action**:
- Use `occ.effectiveActivityId ?? occ.sourceActivityId` to find the activity. For scheduled primaries
  this equals the source; for substitutions it points at the fallback that actually placed.
- If `occ.status === 'skipped'`, return `null`.
- `type === 'consultation'` → consultation note.
- otherwise *quick* iff `isBlocking` would be false — i.e. `type === 'fitness' && intensity === 'low'`,
  **or** `durationMinutes < 20`.
- else → blocking → no note.

Implementation detail: exact scheduler parity requires the **resolved** policy
(`explicit activity.temporalPolicy > validated hint > getDefaultTemporalPolicy`). The Trace tab does
not currently receive `scheduling-hints`, so choose one of these:
- **Recommended V1:** add a tiny pure helper in `src/lib/temporal-classification.ts` (or similar) that
  exposes `isBlockingActivity(activity, resolvedPolicy)` / `overlapExplanationKind(...)`, and call it
  with `activity.temporalPolicy ?? getDefaultTemporalPolicy(activity)` from the UI. This matches all
  explicit-policy and default-policy cases and is enough for the known fixture after 025.
- **Exact V2:** thread the validated hints or the scheduler's resolved blocking/intensity classification
  into diagnostics/occurrences, then call the same helper with the actual resolved policy. This is more
  wiring and should only be done if a hint-only low-intensity action needs the note.

Do not import a private `isBlocking` from `temporal-scheduler.ts` into the component unless it is first
extracted to a small side-effect-free helper; `temporal-scheduler.ts` should stay the allocator, not a
UI utility module.

## Decisions to lock

1. **Scope = activity-class note (V1)** vs. occurrence-specific overlap detection (V2). V1 explains the
   rule from the activity class and needs no new data. V2 ("this occurrence overlaps your *Morning work
   block*") would thread the day's `memberBusy` into the tab and detect the actual overlap — more
   precise, more wiring. Recommend **V1** now; V2 only if reviewers want the specific block named.
2. **Surface:** Trace tab only (recommended), or also a tooltip/legend on the **DayTimeline** where the
   overlap is first *seen*. Recommend Trace-only for V1, with the DayTimeline as a fast follow.
3. **Copy** — confirm the two strings above (kept plain, member-facing, no jargon).

## Implementation notes

- Pure presentational/classification change; **no placement/scoring change**, so determinism / skip rate
  / A1 are untouched.
- Share the blocking/quick definition by extracting the 2-line rule out of `temporal-scheduler.ts`
  rather than copying it inside the React component.
- For substituted occurrences, explain the fallback/effective action, not the original source action.
- Place the callout so it reads before the attempt cards (the "why allowed" should precede the "how
  placed"). Fits naturally next to the 023 "About this action" panel.

## Testing & acceptance

- **Unit (small pure classifier):** `overlapExplanationKind(occ, activity, policy)` returns
  `'consultation' | 'quick' | null` — assert consultation → consultation, a pill/short log → quick,
  explicit low-intensity fitness with duration ≥20 → quick, a 60-min strength session → null, skipped
  occurrence → null, substituted occurrence classifies by `effectiveActivityId`.
- **Acceptance (`drive-acceptance.mjs`):** open a consultation occurrence's Trace → the work-overlap
  note is visible; open a quick action (pill/BP log) → the quick-action note is visible; open a focused
  workout → no note. Prefer stable fixture examples (a placed consultation, not the skipped A1
  Cardiology Review; Blood Pressure Log or a short medication for quick; Lower Body Strength for
  focused).
- `tsc` clean · `npm test` green · `npm run build` green · 0 console errors.

## Out of scope

- Any scheduler/placement change (this is explanation only).
- Per-minute / per-block overlap auditing (that's V2 occurrence-specific detection).
- Changing the overlap rules themselves — they are intentional (024 preserved the consultation↔work
  exception; the quick-vs-blocking split is the 015 realism model).
