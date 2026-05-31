/**
 * 023 Phase 1 — generate src/data/activity-education.json (member-facing health-education
 * profiles for ALL 116 activities, including backup-only fallbacks).
 *
 *   node scripts/generate-activity-education.mjs       (or: npm run generate:activity-education)
 *
 * The LLM (gpt-5.3-chat-latest) reads the activity catalog and emits one conservative
 * ActivityEducationProfile per activity, in BATCHES (~24/call) to keep each response small and
 * reliable. Every entry is re-validated + safety-filtered; any id the LLM omits, returns badly,
 * or phrases unsafely falls back PER-ID to a deterministic type-based template. With no API key
 * the whole file is the deterministic template, so `npm run build` / tests never need network.
 * generatedAt is stamped to a fixed literal for reproducible diffs. Never logs the API key.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'gpt-5.3-chat-latest';
const GENERATED_AT = '2026-06-01T00:00:00Z'; // stamped fixed for reproducible diffs; bump on regen
const BATCH_SIZE = 24;

// Mirror of validate.ts EDUCATION_UNSAFE_PATTERNS (kept in sync; the build re-validates strictly).
const UNSAFE_PATTERNS = [
  /\bcure(s|d)?\b/i,
  /\bguarantee(s|d)?\b/i,
  /\bdiagnose(s|d)?\b/i,
  /\bdiagnosis\b/i,
  /\b(increase|raise|adjust|change|double)\s+(the\s+)?dose\b/i,
  /\bstop taking\b/i,
  /\bprevent(s|ed|ion)?\b/i,
  /\btreat(s|ed|ment|ing)?\b/i,
];

function loadKey() {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/OPENAI_API_KEY=([^\n]+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const cap = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const first = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

/** Deterministic, conservative profile for one activity — used as the per-id fallback. */
export function fallbackProfile(activity) {
  const { id, type, title, metrics, facilitatorLabel } = activity;
  const signals = first(metrics, 5);
  const focusByType = {
    medication: ['adherence', 'monitoring'],
    food: ['nutrition', 'consistency'],
    fitness: ['cardiorespiratory fitness', 'recovery'],
    therapy: ['recovery', 'mobility'],
    consultation: ['care-team review', 'adherence'],
  };
  const templates = {
    medication: {
      oneLine: `${title} — supports medication and monitoring adherence the care team can track.`,
      whatItDoes: `${title} is a scheduled medication or monitoring step the member completes as part of their plan.`,
      whyItMatters: `Keeping this consistent helps the care team track adherence over time and review the plan with reliable data. It is intended to support steady follow-through, not to replace clinician guidance.`,
      memberGuidance: `Log completion and any side-effects so the care team can spot patterns; follow your clinician's existing instructions for timing.`,
      careTeamNote: `Useful for longitudinal adherence tracking and plan review.`,
    },
    food: {
      oneLine: `${title} — a nutrition step that supports consistency and logged daily response.`,
      whatItDoes: `${title} is a planned nutrition action the member follows to keep daily intake consistent.`,
      whyItMatters: `Consistent nutrition may support energy, satiety, and glucose stability, and the logged response helps the care team see what is working. It is intended to support steady habits over time.`,
      memberGuidance: `Log what you ate and how you felt so the care team can review your response over time.`,
      careTeamNote: `Supports nutrition consistency and longitudinal review of logged response.`,
    },
    fitness: {
      oneLine: `${title} — a movement session that may support fitness and recovery.`,
      whatItDoes: `${title} is a planned training session in the member's movement plan, balanced against recovery and availability.`,
      whyItMatters: `Regular movement may support cardiorespiratory fitness and recovery, and the logged session data helps the care team adjust load over time. It is intended to support steady progress, not to push intensity beyond the plan.`,
      memberGuidance: `Check readiness before starting and log the session so the care team can balance training and recovery.`,
      careTeamNote: `Supports training consistency; session metrics inform load and recovery review.`,
    },
    therapy: {
      oneLine: `${title} — a recovery or mobility session the care team can track over time.`,
      whatItDoes: `${title} is a planned recovery, mobility, or restorative session in the member's plan.`,
      whyItMatters: `Recovery and mobility work may support how the member feels and moves day to day, and the logged response helps the care team track progress. It is intended to support steady recovery, not to replace clinical care.`,
      memberGuidance: `Log how you felt afterwards so the care team can track recovery and mobility over time.`,
      careTeamNote: `Supports recovery/mobility consistency and longitudinal review.`,
    },
    consultation: {
      oneLine: `${title} — a care-team review that supports decisions and plan updates.`,
      whatItDoes: `${title} is a scheduled review or consultation where the care team checks progress and decision points.`,
      whyItMatters: `Regular review helps the care team keep the plan current and make decisions with up-to-date data. It is intended to support informed plan updates and continuity of care.`,
      memberGuidance: `Bring any questions and recent logs so the care team can review your plan effectively.`,
      careTeamNote: `Supports decision-making and keeping the plan current with member data.`,
    },
  };
  const t = templates[type] ?? templates.consultation;
  const focus = first(focusByType[type] ?? ['adherence'], 5);
  void facilitatorLabel; // intentionally not surfaced in copy
  return {
    activityId: id,
    oneLine: cap(t.oneLine, 120),
    whatItDoes: t.whatItDoes,
    whyItMatters: t.whyItMatters,
    healthFocus: focus,
    expectedSignals: signals,
    memberGuidance: t.memberGuidance,
    careTeamNote: t.careTeamNote,
    generatedBy: 'deterministic-fallback',
    generatedAt: GENERATED_AT,
  };
}

function isUnsafe(p) {
  const text = [p.oneLine, p.whatItDoes, p.whyItMatters, p.memberGuidance, p.careTeamNote, ...(p.healthFocus ?? []), ...(p.expectedSignals ?? [])].join(' ');
  return UNSAFE_PATTERNS.some((re) => re.test(text));
}

/** Accept an LLM entry only if it is well-shaped, within caps, signal-grounded, and safe. */
function acceptLLM(raw, activity) {
  if (!raw || typeof raw !== 'object') return null;
  const metricSet = new Set(activity.metrics);
  const str = (x) => (typeof x === 'string' ? x.trim() : '');
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string').map((s) => s.trim()).filter(Boolean) : []);
  const p = {
    activityId: activity.id,
    oneLine: str(raw.oneLine),
    whatItDoes: str(raw.whatItDoes),
    whyItMatters: str(raw.whyItMatters),
    // expectedSignals must come from the activity's metrics — drop any invented ones.
    healthFocus: arr(raw.healthFocus).slice(0, 5),
    expectedSignals: arr(raw.expectedSignals).filter((s) => metricSet.has(s)).slice(0, 5),
    memberGuidance: str(raw.memberGuidance),
    careTeamNote: str(raw.careTeamNote),
    generatedBy: MODEL,
    generatedAt: GENERATED_AT,
  };
  if (!p.oneLine || p.oneLine.length > 120) return null;
  if (!p.whatItDoes || p.whatItDoes.length > 400) return null;
  if (!p.whyItMatters || p.whyItMatters.length > 400) return null;
  if (!p.memberGuidance || p.memberGuidance.length > 400) return null;
  if (!p.careTeamNote || p.careTeamNote.length > 400) return null;
  if (p.healthFocus.length === 0) return null;
  if (isUnsafe(p)) return null;
  return p;
}

function buildPrompt(batch) {
  const lines = batch
    .map((a) => `${a.id} | ${a.type} | ${a.title} | facilitator: ${a.facilitatorLabel} | metrics: [${a.metrics.join(', ') || 'none'}] | freq: ${a.frequency.count}/${a.frequency.period}`)
    .join('\n');
  return `You write SHORT, conservative health-education copy for a member's health-plan app.
For EACH activity below, return one profile. Return ONLY JSON:
{ "profiles": [ {
  "activityId": "<exact id>",
  "oneLine": "<= 120 chars; one plain sentence the member sees under the title",
  "whatItDoes": "ONE sentence explaining the action plainly",
  "whyItMatters": "1-2 sentences on its intended health-plan role",
  "healthFocus": ["1-4 short tags, e.g. blood pressure, glucose stability, cardiorespiratory fitness, recovery, adherence, mobility, sleep, nutrition"],
  "expectedSignals": ["ONLY metric names copied verbatim from this activity's metrics list; [] if none"],
  "memberGuidance": "one practical member-facing note",
  "careTeamNote": "one brief reviewer-facing rationale"
} ] }

SAFETY (mandatory — violating copy is discarded):
- NO dosing instructions; never say to increase/raise/adjust/change/double a dose or to stop taking anything.
- NO "cure", "guarantee", "diagnose", "prevent", or "treat" language. No promised outcomes. No diagnosis.
- Prefer "may support", "helps the care team track", "is intended to", "supports consistency".
- expectedSignals MUST be drawn only from the activity's own metrics list — never invent signals.
- medication/supplement/monitoring: emphasize adherence, monitoring, side-effect awareness, care-team review.
- fitness/therapy: training/recovery/mobility intent without prescribing intensity.
- food: consistency, energy/satiety/glucose support, logged response — no disease claims.
- consultation: review / decision-support / plan-update purpose.
Keep every field concise and calm. Use the EXACT activityId for each entry.

ACTIVITIES (id | type | title | facilitator | metrics | frequency):
${lines}`;
}

async function callLLM(key, batch) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid minified JSON. No markdown.' },
        { role: 'user', content: buildPrompt(batch) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const parsed = JSON.parse((await res.json()).choices[0].message.content);
  return Array.isArray(parsed.profiles) ? parsed.profiles : [];
}

function main() {
  return (async () => {
    const activities = JSON.parse(readFileSync('src/data/activities.json', 'utf8'));
    const byId = new Map(activities.map((a) => [a.id, a]));
    const accepted = new Map(); // id -> profile

    const key = loadKey();
    let llmCount = 0;
    if (key) {
      for (let i = 0; i < activities.length; i += BATCH_SIZE) {
        const batch = activities.slice(i, i + BATCH_SIZE);
        try {
          const raw = await callLLM(key, batch);
          for (const entry of raw) {
            const act = byId.get(entry?.activityId);
            if (!act || accepted.has(act.id)) continue;
            const ok = acceptLLM(entry, act);
            if (ok) {
              accepted.set(act.id, ok);
              llmCount++;
            }
          }
        } catch (e) {
          console.warn(`batch ${i / BATCH_SIZE + 1} failed; falling back per-id:`, e.message);
        }
      }
    } else {
      console.warn('No OPENAI_API_KEY; writing deterministic-fallback profiles for all activities.');
    }

    // Per-id deterministic fallback for everything the LLM didn't cover safely.
    let fallbackCount = 0;
    const profiles = [];
    for (const a of activities) {
      let p = accepted.get(a.id);
      if (!p) {
        p = fallbackProfile(a);
        fallbackCount++;
      }
      profiles.push(p);
    }
    profiles.sort((x, y) => (x.activityId < y.activityId ? -1 : x.activityId > y.activityId ? 1 : 0));

    writeFileSync('src/data/activity-education.json', JSON.stringify(profiles, null, 2) + '\n');
    console.log(`wrote activity-education.json: ${profiles.length} profiles (${llmCount} LLM, ${fallbackCount} deterministic-fallback; model: ${key && llmCount ? MODEL : 'none'}).`);
  })();
}

// Only run when invoked directly — the test imports fallbackProfile without generating.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('generate-activity-education.mjs');
if (invokedDirectly) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
