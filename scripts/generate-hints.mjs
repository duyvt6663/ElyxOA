/**
 * 015 Task 4 — generate src/data/scheduling-hints.json (the LLM "semantic compiler").
 *
 *   node scripts/generate-hints.mjs            (or: npm run generate:hints)
 *
 * The LLM (gpt-5.3-chat-latest) reads the activity catalog + member busy-block titles and
 * emits TYPED hints only: per-activity temporal policies (confidence-scored) and busy-block
 * classifications. The deterministic scheduler validates + filters these (confidence >= 0.7,
 * references must resolve) and merges activity policies as explicit > hint > default. No final
 * schedule is ever taken from the model. Falls back to an empty (but valid) hints file when no
 * key/failure, so `npm run build` never needs the network or credentials.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'gpt-5.3-chat-latest';
const CONFIDENCE_FLOOR = 0.7;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const CATEGORIES = ['sleep', 'work', 'commute', 'meal', 'family', 'travel', 'personal', 'clinical', 'buffer'];

function loadKey() {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/OPENAI_API_KEY=([^\n]+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function validWindow(w) {
  return w && ['morning', 'midday', 'afternoon', 'evening'].includes(w.label) && HHMM.test(w.startTime) && HHMM.test(w.endTime) && w.startTime < w.endTime;
}
function validPolicy(p) {
  return p && Array.isArray(p.preferredWindows) && p.preferredWindows.length > 0 && p.preferredWindows.every(validWindow);
}

async function callLLM(key, activities, busy) {
  const actLines = activities
    .filter((a) => !a.isBackupOnly && !a.temporalPolicy)
    .map((a) => `${a.id} | ${a.type} | ${a.title} | ${a.durationMinutes}m | ${a.frequency.count}/${a.frequency.period}`)
    .join('\n');
  const busyLines = busy.map((b) => `${b.id} | ${b.category} | ${b.title}`).join('\n');
  const prompt = `You are a scheduling semantic compiler. Given a health action catalog and a member's
recurring busy-block titles, output TYPED HINTS only (no final schedule). Return ONLY JSON:
{
  "activityPolicies": [
    {"activityId": "<id>", "confidence": 0..1, "rationale": "<short>",
     "temporalPolicy": {"preferredWindows":[{"label":"morning|midday|afternoon|evening","startTime":"HH:MM","endTime":"HH:MM"}],
        "anchor":"wake|breakfast|lunch|dinner|bedtime|any","intensity":"none|low|moderate|high"}}
  ],
  "busyBlockClassifications": [
    {"busyBlockId":"<id>","category":"<one of sleep,work,commute,meal,family,travel,personal,clinical,buffer>",
     "blocksScheduling":true,"visibleByDefault":true,"confidence":0..1,"rationale":"<short>"}
  ],
  "warnings": [{"severity":"info|warning|error","targetId":"<optional id>","message":"<short>"}]
}
Rules:
- Only use activityId / busyBlockId values from the lists below — never invent ids.
- Infer realistic windows from the title/type: morning meds ~07:00-09:00; BP/monitoring 06:30-08:30
  before exertion; high-intensity fitness 07:00-11:00 or 16:00-18:30; recovery/downshift therapy
  20:30-22:00; consultations 09:00-17:00; meals at their meal time. HH:MM 24h, start < end.
- confidence reflects how sure the inference is. Low-confidence hints will be ignored.
- Cover ~20 of the most policy-relevant activities + every busy block. Keep rationales short.

ACTIVITIES (id | type | title | duration | frequency):
${actLines}

BUSY BLOCKS (id | current-category | title):
${busyLines}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid minified JSON. No markdown.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

function main() {
  return (async () => {
    const activities = JSON.parse(readFileSync('src/data/activities.json', 'utf8'));
    const availability = JSON.parse(readFileSync('src/data/availability.json', 'utf8'));
    const actIds = new Set(activities.map((a) => a.id));
    const busyIds = new Set(availability.memberBusy.map((m) => m.id));

    let raw = { activityPolicies: [], busyBlockClassifications: [], warnings: [] };
    let model;
    const key = loadKey();
    if (key) {
      try {
        raw = await callLLM(key, activities, availability.memberBusy);
        model = MODEL;
      } catch (e) {
        console.warn('LLM hint generation failed; writing empty hints:', e.message);
      }
    } else {
      console.warn('No OPENAI_API_KEY; writing empty (valid) hints.');
    }

    // Filter to valid, in-fixture, above-floor hints (defensive — the build re-validates strictly).
    const activityPolicies = (raw.activityPolicies ?? []).filter(
      (h) => h && actIds.has(h.activityId) && typeof h.confidence === 'number' && h.confidence >= CONFIDENCE_FLOOR && validPolicy(h.temporalPolicy) && typeof h.rationale === 'string',
    );
    const busyBlockClassifications = (raw.busyBlockClassifications ?? []).filter(
      (c) => c && busyIds.has(c.busyBlockId) && CATEGORIES.includes(c.category) && typeof c.confidence === 'number' && c.confidence >= CONFIDENCE_FLOOR && typeof c.blocksScheduling === 'boolean' && typeof c.visibleByDefault === 'boolean' && typeof c.rationale === 'string',
    );
    const warnings = (raw.warnings ?? []).filter((w) => w && ['info', 'warning', 'error'].includes(w.severity) && typeof w.message === 'string');

    const hints = {
      generatedAt: '2026-05-31T00:00:00Z', // stamped fixed for reproducible builds; bump on regen
      ...(model ? { model } : {}),
      activityPolicies,
      busyBlockClassifications,
      globalRules: [],
      warnings,
    };

    writeFileSync('src/data/scheduling-hints.json', JSON.stringify(hints, null, 2) + '\n');
    console.log(
      `wrote scheduling-hints.json: ${activityPolicies.length} activity policies, ${busyBlockClassifications.length} busy classifications, ${warnings.length} warnings (model: ${model ?? 'none'}).`,
    );
  })();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
