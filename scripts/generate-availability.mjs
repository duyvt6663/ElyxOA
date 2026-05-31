/**
 * 015 Task 3 — generate realistic member busy blocks into src/data/availability.json.
 *
 *   node scripts/generate-availability.mjs
 *
 * The LLM (gpt-5.3-chat-latest) designs the weekly *pattern* (sleep/work/commute/meals/
 * family + travel-day shape) with realistic texture; this script expands it deterministically
 * across the 2026-06-01..2026-08-31 window and groups it into MemberBusyBlock records.
 * Falls back to a built-in deterministic pattern when no API key is present or the call fails,
 * so the committed fixture never depends on the network. Existing travel/equipment/specialist/
 * allied data is preserved; only timeZone + memberBusy are (re)written.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WINDOW_START = '2026-06-01';
const WINDOW_END = '2026-08-31';
const TZ = 'America/Los_Angeles';
const MODEL = 'gpt-5.3-chat-latest';

// ---------- date helpers (UTC) ----------
const toUTC = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fmt = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};
const eachDay = (start, end) => {
  const out = [];
  for (let t = toUTC(start); t <= toUTC(end); t += 86400000) out.push(fmt(t));
  return out;
};
const dow = (s) => new Date(toUTC(s)).getUTCDay(); // 0=Sun..6=Sat

// ---------- deterministic fallback pattern ----------
const BASE = {
  weekday: [
    { category: 'sleep', title: 'Sleep', start: '00:00', end: '06:30' },
    { category: 'meal', title: 'Breakfast', start: '07:30', end: '08:00' },
    { category: 'commute', title: 'Commute to office', start: '08:30', end: '09:00' },
    { category: 'work', title: 'Morning work block', start: '09:00', end: '12:00' },
    { category: 'meal', title: 'Lunch', start: '12:15', end: '13:00' },
    { category: 'work', title: 'Afternoon work block', start: '13:00', end: '17:30' },
    { category: 'commute', title: 'Commute home', start: '17:30', end: '18:15' },
    { category: 'family', title: 'Family time', start: '18:30', end: '20:00' },
    { category: 'meal', title: 'Dinner', start: '19:00', end: '19:45' },
    { category: 'sleep', title: 'Sleep', start: '22:30', end: '23:59' },
  ],
  weekendSat: [
    { category: 'sleep', title: 'Sleep', start: '00:00', end: '07:30' },
    { category: 'meal', title: 'Breakfast', start: '08:30', end: '09:15' },
    { category: 'family', title: 'Weekend family block', start: '10:00', end: '13:00' },
    { category: 'meal', title: 'Lunch', start: '13:00', end: '13:45' },
    { category: 'personal', title: 'Errands and personal time', start: '15:00', end: '17:00' },
    { category: 'meal', title: 'Dinner', start: '19:00', end: '19:45' },
    { category: 'sleep', title: 'Sleep', start: '23:00', end: '23:59' },
  ],
  weekendSun: [
    { category: 'sleep', title: 'Sleep', start: '00:00', end: '07:30' },
    { category: 'meal', title: 'Breakfast', start: '08:30', end: '09:15' },
    { category: 'family', title: 'Weekend family block', start: '11:00', end: '14:00' },
    { category: 'meal', title: 'Lunch', start: '13:00', end: '13:45' },
    { category: 'personal', title: 'Weekly planning and reset', start: '16:00', end: '17:30' },
    { category: 'meal', title: 'Dinner', start: '18:30', end: '19:15' },
    { category: 'sleep', title: 'Sleep', start: '22:30', end: '23:59' },
  ],
  travelDay: [
    { category: 'sleep', title: 'Sleep', start: '00:00', end: '06:30' },
    { category: 'meal', title: 'Breakfast', start: '07:30', end: '08:00' },
    { category: 'travel', title: 'Travel and transit', start: '09:00', end: '17:00' },
    { category: 'meal', title: 'Dinner', start: '19:00', end: '19:45' },
    { category: 'sleep', title: 'Sleep', start: '22:30', end: '23:59' },
  ],
  // Extra blocks layered onto meeting-heavy weekdays (Tue/Thu).
  meetingHeavyExtra: [{ category: 'work', title: 'Standing meetings', start: '08:00', end: '08:30' }],
};

// ---------- semantics by category ----------
const BLOCKS_SCHEDULING = new Set(['sleep', 'work', 'commute', 'family', 'travel', 'personal', 'clinical']);
const blocksScheduling = (cat) => BLOCKS_SCHEDULING.has(cat) || cat === 'meal';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function loadKey() {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/OPENAI_API_KEY=([^\n]+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function llmPattern(key) {
  const prompt = `You design a realistic recurring weekly calendar for a busy executive health-coaching member.
Return ONLY JSON matching this exact shape (no prose):
{
  "weekday": [{"category": <cat>, "title": <string>, "start": "HH:MM", "end": "HH:MM"}],
  "weekendSat": [...], "weekendSun": [...], "travelDay": [...],
  "meetingHeavyExtra": [...]
}
Rules:
- category in: sleep, work, commute, meal, family, travel, personal, clinical, buffer.
- HH:MM 24h, 30-min friendly. No block may cross midnight: split overnight sleep into
  "00:00"-"06:30" (morning) and "22:30"-"23:59" (night).
- Include: split sleep, breakfast/lunch/dinner meal blocks, weekday morning+afternoon work,
  commute to/from office, an evening family block, weekend long family/personal blocks, and a
  travel-day shape with a transit block instead of office work.
- Times realistic for someone training around a 9-5. Keep each list 6-11 blocks.
- meetingHeavyExtra: 1-2 extra short work blocks layered on busy weekdays.`;
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
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}

function validBlockList(list) {
  return (
    Array.isArray(list) &&
    list.every(
      (b) =>
        b &&
        typeof b.title === 'string' &&
        typeof b.category === 'string' &&
        HHMM.test(b.start) &&
        HHMM.test(b.end) &&
        b.start < b.end,
    )
  );
}

function validPattern(p) {
  return p && ['weekday', 'weekendSat', 'weekendSun', 'travelDay'].every((k) => validBlockList(p[k]));
}

function travelRanges(availability) {
  const ranges = [];
  for (const tp of availability.travel) for (const r of tp.blocked) ranges.push(r);
  return ranges;
}
const inRanges = (date, ranges) => ranges.some((r) => date >= r.start && date <= r.end);

async function main() {
  const availability = JSON.parse(readFileSync('src/data/availability.json', 'utf8'));
  const key = loadKey();

  let pattern = BASE;
  let source = 'deterministic-fallback';
  if (key) {
    try {
      const llm = await llmPattern(key);
      // Merge: take LLM-provided lists when valid, keep BASE for any missing/invalid.
      const merged = { ...BASE };
      for (const k of ['weekday', 'weekendSat', 'weekendSun', 'travelDay', 'meetingHeavyExtra']) {
        if (validBlockList(llm[k])) merged[k] = llm[k];
      }
      if (validPattern(merged)) {
        pattern = merged;
        source = `llm:${MODEL}`;
      } else {
        console.warn('LLM pattern invalid; using deterministic fallback.');
      }
    } catch (e) {
      console.warn('LLM call failed; using deterministic fallback:', e.message);
    }
  } else {
    console.warn('No OPENAI_API_KEY; using deterministic fallback.');
  }
  console.log('pattern source:', source);

  const tRanges = travelRanges(availability);
  // group key -> { category, title, blocks: [] }
  const groups = new Map();
  const emit = (date, b) => {
    const k = `${b.category}||${b.title}`;
    if (!groups.has(k)) groups.set(k, { category: b.category, title: b.title, blocks: [] });
    groups.get(k).blocks.push({ date, startTime: b.start, endTime: b.end });
  };

  for (const date of eachDay(WINDOW_START, WINDOW_END)) {
    let blocks;
    if (inRanges(date, tRanges)) blocks = pattern.travelDay;
    else if (dow(date) === 6) blocks = pattern.weekendSat;
    else if (dow(date) === 0) blocks = pattern.weekendSun;
    else {
      blocks = pattern.weekday;
      if ((dow(date) === 2 || dow(date) === 4) && Array.isArray(pattern.meetingHeavyExtra)) {
        blocks = blocks.concat(pattern.meetingHeavyExtra);
      }
    }
    for (const b of blocks) emit(date, b);
  }

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const memberBusy = [...groups.values()].map((g) => ({
    id: `mb-${slug(g.category)}-${slug(g.title)}`,
    title: g.title,
    category: g.category,
    blocks: g.blocks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startTime < b.startTime ? -1 : 1)),
    blocksScheduling: blocksScheduling(g.category),
    visibleByDefault: true,
  }));

  availability.timeZone = TZ;
  availability.memberBusy = memberBusy;

  // Re-key field order: keep windowStart/windowEnd/timeZone/memberBusy first.
  const ordered = {
    windowStart: availability.windowStart,
    windowEnd: availability.windowEnd,
    timeZone: availability.timeZone,
    memberBusy: availability.memberBusy,
    travel: availability.travel,
    equipment: availability.equipment,
    specialists: availability.specialists,
    alliedHealth: availability.alliedHealth,
  };
  writeFileSync('src/data/availability.json', JSON.stringify(ordered, null, 2) + '\n');

  const totalBlocks = memberBusy.reduce((n, mb) => n + mb.blocks.length, 0);
  console.log(`wrote ${memberBusy.length} MemberBusyBlock groups, ${totalBlocks} time blocks across 92 days.`);
  console.log('categories:', [...new Set(memberBusy.map((m) => m.category))].join(', '));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
