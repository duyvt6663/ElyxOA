# Elyx Resource Allocator

Transforms a priority-ordered health action plan (>=100 activities) into a personalized 3-month calendar that adapts to travel, equipment, specialist, and allied-health availability.

**Hosted:** _TODO once deployed — see [`docs/DEPLOY.md`](docs/DEPLOY.md)._

## Quick Start

Requires Node 22 (see `.nvmrc`).

1. `npm install` — install dependencies.
2. `npm run dev` — start the dev server at http://localhost:3000.
3. `npm run build` — produce the production build.
4. `npm test` — run the Vitest suite.

## How It Works

Static JSON fixtures (activities + availability) → pure deterministic `schedule()` invoked during static route render → readable month-grid calendar. No backend, no runtime fetch, no database — the schedule is computed once at build time and served as static HTML.

## Assignment Requirements

| # | Deliverable | Where |
|---|---|---|
| 1 | ≥100 prioritized activities | `src/data/activities.json` |
| 2 | 3-month availability data (travel, equipment, specialists, allied health) | `src/data/availability.json` |
| 3 | Scheduler that adapts the plan to availability | `src/lib/scheduler.ts` + tests in `src/lib/scheduler.test.ts` |
| 4 | Readable calendar output | `src/components/CalendarView.tsx` rendered at `/` |
| 5 | Hosted deployment | see [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| 6 | GitHub link + LLM prompts | this README + [`docs/prompts/`](docs/prompts/) |

## Scheduler Assumptions & Limitations

- **Pure & deterministic**: same inputs always produce the same calendar; no randomness, no I/O.
- **Whole-day granularity**: occurrences are scheduled per calendar day; no intra-day time slots.
- **Single member**: the scheduler plans for one person; not multi-tenant.
- **Exclusive resource capacity**: each resource accepts at most one booking per day.
- **Greedy by priority**: higher-priority activities are placed first; this is documented as a tradeoff and is NOT globally optimal — a lower-priority activity may pre-empt a slot a higher-priority backup would later need.
- **Fixed window**: 2026-06-01 .. 2026-08-31 (inclusive), 92 days.
- **Asymmetric availability model**: travel and equipment use *blocked-default* windows (everything available unless an entry blocks it); specialists and allied health use *available-default* windows (nothing bookable unless an entry opens it).
- **Remote-from-travel**: an activity with `canBeRemote: true` bypasses the physical-location and equipment constraints during travel, but still requires the specialist/allied calendar to be open.

## Data Model Summary

- [`src/lib/types.ts`](src/lib/types.ts) — canonical TypeScript types (`Activity`, `AvailabilityBundle`, `Occurrence`, `ScheduleResult`).
- [`src/lib/roles.ts`](src/lib/roles.ts) — rich role vocabulary: 15 equipment, 7 specialist, 7 allied-health roles.
- [`src/lib/validate.ts`](src/lib/validate.ts) — boundary type guards for the JSON fixtures.

Activities reference resources by `(kind, role)`; the scheduler matches each requirement against the corresponding availability node before placing an occurrence on a given day.

## Project Structure

```text
.
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vitest.config.ts
├── .nvmrc
├── docs/
│   ├── DEPLOY.md
│   ├── context/
│   ├── backlog/
│   └── prompts/
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    ├── components/
    │   └── CalendarView.tsx
    ├── lib/
    │   ├── types.ts
    │   ├── roles.ts
    │   ├── validate.ts
    │   ├── scheduler.ts
    │   └── scheduler.test.ts
    └── data/
        ├── activities.json
        └── availability.json
```

## Prompts

LLM prompts used for app scaffolding and data generation live in [`docs/prompts/`](docs/prompts/).

## Out of Scope

- Single-member only — no multi-tenant or per-tenant data isolation.
- No practitioner or customer accounts; no RBAC.
- No persistence layer; no database.
- No runtime mutation in the scheduler — it is a build-time pure function.
- No calendar drag-drop or inline edit.
- Stretch goal "runtime import & rerun" is captured in [`docs/backlog/009-runtime-import-and-rerun.md`](docs/backlog/009-runtime-import-and-rerun.md) but is not required for this submission.

## Reviewer Checklist

1. Open the hosted URL above.
2. Confirm the calendar is the first screen (no login, no landing page).
3. Inspect occurrences and observe the three states: **scheduled**, **substituted** (backup used), **skipped** (with reason).
4. Navigate across June, July, and August to confirm all three months render.
5. Resize the viewport to mobile width and confirm the calendar remains readable.
