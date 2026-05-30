# Availability Generation (004) Prompt

Prompt template for the `AvailabilityBundle` JSON fixture. The template embeds the canonical bundle shape, the asymmetric availability model, the resource inventory, and the six engineered conflicts that drive scheduler test coverage.

```text
You are generating a JSON fixture describing 3 months of availability for a single
member of a deterministic health-plan scheduler.

WINDOW: 2026-06-01 .. 2026-08-31 inclusive (92 days). All dates are ISO YYYY-MM-DD.

CANONICAL SHAPE:

interface DateRange { start: string; end: string; }   // inclusive, ISO YYYY-MM-DD

interface TravelPlan {
  id: string;                    // "travel-01", "travel-02", ...
  destination: string;
  range: DateRange;              // member is AWAY during this range
}

// BLOCKED-default: equipment is available every day EXCEPT during blocked ranges.
interface EquipmentAvailability {
  id: string;                    // "eq-<role>-01"
  role: string;                  // canonical equipment role
  blocked: DateRange[];
}

// AVAILABLE-default: specialist is NOT bookable unless a window opens them.
interface SpecialistAvailability {
  id: string;                    // "sp-<role>-01"
  role: string;                  // canonical specialist role
  available: DateRange[];
}

// AVAILABLE-default: allied-health bookable only inside `available` windows.
interface AlliedHealthAvailability {
  id: string;                    // "ah-<role>-01"
  role: string;                  // canonical allied role
  available: DateRange[];
}

interface AvailabilityBundle {
  window: DateRange;             // { start: "2026-06-01", end: "2026-08-31" }
  travel: TravelPlan[];
  equipment: EquipmentAvailability[];
  specialists: SpecialistAvailability[];
  allied: AlliedHealthAvailability[];
}

ASYMMETRIC AVAILABILITY MODEL:
- travel: presence of a TravelPlan means the member is AWAY for that range.
- equipment: blocked-default model — listed `blocked` ranges mark UNAVAILABLE days; all other days inside the window are available.
- specialists: available-default model — only days inside `available` ranges are bookable.
- allied: available-default model, same as specialists.

RESOURCE INVENTORY (one entry per role, id suffix "-01"):

Equipment (15) — ids `eq-<role>-01`:
  eq-treadmill-01, eq-stationary-bike-01, eq-rowing-machine-01, eq-squat-rack-01,
  eq-dumbbells-01, eq-kettlebell-01, eq-resistance-bands-01, eq-yoga-mat-01,
  eq-foam-roller-01, eq-ice-bath-01, eq-sauna-01, eq-blood-pressure-cuff-01,
  eq-glucose-monitor-01, eq-sleep-tracker-01, eq-smart-scale-01

Specialists (7) — ids `sp-<role>-01`:
  sp-cardiologist-01, sp-endocrinologist-01, sp-dermatologist-01,
  sp-gastroenterologist-01, sp-sleep-specialist-01, sp-psychiatrist-01,
  sp-primary-care-physician-01

Allied (7) — ids `ah-<role>-01`:
  ah-physio-01, ah-nutritionist-01, ah-health-coach-01,
  ah-mental-health-counselor-01, ah-massage-therapist-01,
  ah-acupuncturist-01, ah-personal-trainer-01

Travel: travel-01 and travel-02.

ENGINEERED CONFLICTS (these MUST appear so the scheduler exercises every fallback path):
1. travel-01: destination "Singapore", range 2026-06-22 .. 2026-06-29.
2. travel-02: destination "Tokyo",     range 2026-08-10 .. 2026-08-14.
3. eq-treadmill-01:  blocked 2026-07-06 .. 2026-07-12.
4. eq-ice-bath-01:   blocked 2026-07-20 .. 2026-07-22.
5. sp-cardiologist-01: available ONLY on 2026-07-01 .. 2026-07-03 AND 2026-08-01 .. 2026-08-03.
6. ah-physio-01: available every day in the window EXCEPT 2026-06-15 .. 2026-07-05
   (i.e. emit two `available` ranges: 2026-06-01..2026-06-14 and 2026-07-06..2026-08-31).

For every other equipment item: `blocked: []`.
For every other specialist and allied resource: a single `available` range covering the full window
  (`{start: "2026-06-01", end: "2026-08-31"}`).

OUTPUT FORMAT:
Return a single JSON OBJECT matching `AvailabilityBundle`. No prose, no markdown fence.
```

## Run record

TODO: record the model and date used to generate the final `src/data/availability.json`.
