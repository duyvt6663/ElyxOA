/**
 * 016 §11 — optional LLM refinement of calendar display-bundle LABELS.
 *
 *   node scripts/generate-bundles.mjs       (or: npm run generate:bundles)
 *
 * The deterministic bundler (src/lib/bundle.ts) groups scheduled low-risk daily food/med by
 * (type, anchor) and ships fixed labels ("Morning meds", "Lunch nutrition", ...). This script
 * lets gpt-5.3-chat-latest refine those into warmer member-facing labels, written to
 * src/data/calendar-bundles.json as { labels: { "type:anchor": "Label" } }. The bundler applies
 * them automatically; an empty file (the default / no-key fallback) just uses the code labels, so
 * `npm run build` never needs the network. Labels only — no scheduling behavior changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'gpt-5.3-chat-latest';
// Keys are the canonical (type, bucket) — buckets: morning, midday, evening, bedtime, any.
const KEY_RE = /^(food|medication):(morning|midday|evening|bedtime|any)$/;
const DEFAULTS = {
  'medication:morning': 'Morning meds',
  'medication:midday': 'Midday meds',
  'medication:evening': 'Evening meds',
  'medication:bedtime': 'Bedtime meds',
  'medication:any': 'Daily meds',
  'food:morning': 'Breakfast nutrition',
  'food:midday': 'Lunch nutrition',
  'food:evening': 'Dinner nutrition',
  'food:any': 'Daily nutrition',
};

function loadKey() {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/OPENAI_API_KEY=([^\n]+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function sampleTitles() {
  const acts = JSON.parse(readFileSync('src/data/activities.json', 'utf8'));
  const pick = (type) =>
    acts
      .filter((a) => !a.isBackupOnly && a.type === type && a.frequency.period === 'day' && a.resources.length === 0)
      .map((a) => a.title)
      .slice(0, 8);
  return { medication: pick('medication'), food: pick('food') };
}

async function main() {
  const key = loadKey();
  let labels = {};
  let model;
  if (key) {
    const titles = sampleTitles();
    const prompt = `Calendar "display bundles" group a member's small daily food/medication habits into
one friendly calendar entry. Refine the bucket labels below into warm, concise, member-facing labels
(max ~22 chars each, Title Case, no emoji). Return ONLY JSON: {"labels": {"<type:anchor>": "<Label>"}}.
Keys must be exactly from this set; keep every key.
Default labels: ${JSON.stringify(DEFAULTS)}
Example daily medication habits: ${JSON.stringify(titles.medication)}
Example daily food habits: ${JSON.stringify(titles.food)}`;
    try {
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
      const raw = JSON.parse((await res.json()).choices[0].message.content);
      const candidate = raw.labels ?? raw;
      // Keep only valid keys + sane labels.
      for (const [k, v] of Object.entries(candidate)) {
        if (KEY_RE.test(k) && typeof v === 'string' && v.trim().length > 0 && v.length <= 30) labels[k] = v.trim();
      }
      model = MODEL;
    } catch (e) {
      console.warn('LLM bundle-label refinement failed; using deterministic labels:', e.message);
      labels = {};
    }
  } else {
    console.warn('No OPENAI_API_KEY; deterministic bundle labels (empty override file).');
  }

  const out = { generatedAt: '2026-05-31T00:00:00Z', ...(model ? { model } : {}), labels };
  writeFileSync('src/data/calendar-bundles.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote calendar-bundles.json: ${Object.keys(labels).length} label overrides (model: ${model ?? 'none'}).`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
