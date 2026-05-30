# Activities Generation (003) Prompt

Prompt template to author the ~102 activities JSON fixture authoring once via an LLM. The template embeds the canonical `Activity` shape, the type distribution, the role vocabulary, and the backup-chain rules so the model produces a fixture that drops directly into `src/data/activities.json`.

```text
You are generating a JSON fixture for a deterministic health-plan scheduler.

Produce a single JSON ARRAY of 102 primary Activity objects plus a small set of
backup-only fallback templates. The final fixture should contain 116 objects total:
102 `isBackupOnly:false` primary activities and 14 `isBackupOnly:true` fallbacks.

type ResourceKind = "equipment" | "specialist" | "alliedHealth";

interface ResourceRequirement {
  kind: ResourceKind;
  role: string;       // must be one of the canonical role names below
  id?: string;        // optional specific resource id; omit to allow any of the role
}

interface Activity {
  id: string;                          // kebab-case, globally unique
  type: "fitness" | "food" | "medication" | "therapy" | "consultation";
  title: string;                       // short, human-readable
  details: string;                     // 1-2 sentence description
  frequency: { count: number; period: "day" | "week" | "month" | "year" };
  durationMinutes: number;
  priority: number;                    // unique integer 1..116, 1 = highest
  facilitatorLabel: string;            // human label e.g. "Self", "Cardiologist", "Physio"
  locations: ("home" | "gym" | "clinic" | "outdoor" | "remote")[];
  canBeRemote: boolean;                // if true, activity may run during travel
  prep: string[];                      // short prep steps, may be empty
  resources: ResourceRequirement[];    // empty array means no resource needed
  backupActivityIds: string[];         // ordered fallback chain; last entry must be no-resource
  skipAdjustment: string;              // what to do if skipped (e.g. "double next dose? NO, just skip")
  metrics: string[];                   // what gets measured (e.g. ["hrv", "rhr"])
  isBackupOnly: boolean;               // true if this activity exists only as a fallback target
}

PRIMARY TYPE DISTRIBUTION (must sum to 102; backup-only fallbacks do not count):
- fitness: 28
- food: 24
- medication: 22
- therapy: 16
- consultation: 12

CANONICAL ROLE VOCABULARY — use these strings verbatim in `resources[].role`:

Equipment (15):
  treadmill, rower, stationary-bike, squat-rack, dumbbells,
  kettlebell, cable-machine, sauna, ice-bath, pool,
  yoga-mat, foam-roller, bp-cuff, glucose-monitor, pulse-oximeter

Specialist (7):
  physician, cardiologist, endocrinologist, sleep-physician,
  dermatologist, psychiatrist, phlebotomist

Allied (7):
  physiotherapist, occupational-therapist, dietitian, speech-therapist,
  massage-therapist, personal-trainer, health-coach

PRIORITY SCHEME:
- Each activity gets a UNIQUE integer priority from 1..116.
- Primary (non-backup) activities take the lower (more important) priorities first.
- `isBackupOnly: true` activities take the highest numeric priorities (least important).

BACKUP CHAIN RULES:
- Every primary activity SHOULD have at least one backup unless it is trivially substitutable.
- Each backup must be the SAME `type` as the primary.
- Each step down the chain must have STRICTLY LOWER resource demand
  (fewer or simpler resources, or `kind: "none"`).
- The LAST id in `backupActivityIds` MUST resolve to an activity whose
  `resources` is `[]` (a no-resource fallback). This guarantees termination.
- Backup-only fallbacks should set `isBackupOnly: true`.

FREQUENCY CADENCE GUIDANCE:
- medication: typically `{count: 1, period: "day"}` (some 2/day, a few 1/week).
- consultation: typically `{count: 1, period: "month"}` or `{count: 1, period: "year"}`.
- therapy: typically `{count: 1, period: "week"}` or `{count: 2, period: "week"}`.
- fitness: mix of `{count: 3, period: "week"}` and daily mobility/walks.
- food: mostly daily habits (`{count: 1, period: "day"}`) plus `{count: 1, period: "week"}` meal prep.

OUTPUT FORMAT:
Return a single JSON array. No prose, no markdown fence, no commentary.
Validate that priorities are unique, ids are unique, and backup chains terminate.
```

## Run record

2026-05-30: Generated locally in Codex (GPT-5) against the canonical
`src/lib/types.ts` and `src/lib/roles.ts` schema. No external OpenAI/Gemini API call was
needed because deterministic local generation plus fixture tests was sufficient.

Final fixture:
- Path: `src/data/activities.json`
- Total records: 116
- Primary records: 102
- Backup-only fallback records: 14
- Primary distribution: fitness 28, food 24, medication 22, therapy 16,
  consultation 12
- Verification: `npm test` and `npm run build` pass on 2026-05-30
