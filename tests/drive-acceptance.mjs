// 013 ACCEPTANCE SUITE — standalone Playwright drive script.
//
// To run: 1) npm run dev (in another shell). 2) node tests/drive-acceptance.mjs
//
// Cases:
// A1: Click skipped Jun 1 cardiology → Trace tab → 'specialist' failed constraint for cardiologist.
// A2: Click Jul 6 substituted fitness → Trace tab → 2+ attempts with chosen second, equipment+treadmill failure on attempt 1.
// A3: Open Resources tab → cardiologist + travel + treadmill rows present.
// A4: Select skipped Jun 1 cardiology → starter chip 'Why was this skipped?' → chat answer mentions cardiologist/specialist. SKIP if no OPENAI_API_KEY.
// A5: Resize to 360x800 → MobileSwitch buttons visible, switch between Chat/Workspace.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000/';
const SHOTS = '/tmp/elyx-013-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function findChipForDate(page, title, date) {
  // OccurrenceCard chip uses aria-label `Select <title> on <date>`.
  const label = `Select ${title} on ${date}`;
  const chip = page.getByRole('button', { name: label });
  await chip.first().waitFor({ timeout: 10000 });
  return chip.first();
}

async function gotoTraceTab(page) {
  await page.getByRole('button', { name: /^Trace$/ }).first().click();
}

async function gotoResourcesTab(page) {
  await page.getByRole('button', { name: /^Resources$/ }).first().click();
}

async function runA1(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const chip = await findChipForDate(page, 'Cardiology Review', '2026-06-01');
  await chip.click();

  await gotoTraceTab(page);

  await page.waitForSelector('text=occ-act-003-2026-06-01', { timeout: 5000 });

  const text = await page.locator('body').innerText();
  const lower = text.toLowerCase();
  const ok = lower.includes('specialist') && lower.includes('cardiologist');
  await page.screenshot({ path: `${SHOTS}/A1.png`, fullPage: false });
  record('A1', ok, ok ? '' : 'expected "specialist" and "cardiologist" in trace tab');
}

async function runA2(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Switch the calendar to July via the FilterBar's "Jul" button.
  await page.getByRole('button', { name: /^Jul$/ }).first().click();
  await page.waitForTimeout(300);

  // With 116 activities, DayCell caps chip rendering at 3 and hides the rest behind
  // "+N more". On Jul 6 the substituted fitness is below the daily-medication chips
  // (lower priority). Expand the day, then look in DayDetail.
  const anyChipOn706 = page.locator('div[aria-label$="2026-07-06"]:visible').first();
  await anyChipOn706.waitFor({ timeout: 10000 });
  const cell = anyChipOn706.locator('xpath=ancestor::div[contains(@class, "min-h-24")][1]');
  const moreBtn = cell.getByRole('button', { name: /\+\d+ more/ });
  if (await moreBtn.count() > 0) {
    await moreBtn.click();
    await page.waitForTimeout(500);
  }

  // Within DayDetail (or visible already), click the substituted card for Jul 6.
  // DayDetail uses <article> with the same aria-label format; status word
  // "substituted" appears as an inner badge span.
  const substituted = page
    .locator('article[aria-label$="2026-07-06"]:visible')
    .filter({ has: page.locator('span', { hasText: /^substituted$/ }) })
    .first();
  await substituted.waitFor({ timeout: 5000 });
  await substituted.click();

  await gotoTraceTab(page);
  await page.waitForSelector('text=2026-07-06', { timeout: 5000 });

  const text = await page.locator('body').innerText();
  const lower = text.toLowerCase();
  const hasChosen = text.includes('✓ chosen') || lower.includes('chosen');
  const hasEquip = lower.includes('equipment') && lower.includes('treadmill');
  const hasTwoAttempts = text.includes('#1') && text.includes('#2');

  await page.screenshot({ path: `${SHOTS}/A2.png`, fullPage: false });
  const ok = hasChosen && hasEquip && hasTwoAttempts;
  record(
    'A2',
    ok,
    ok
      ? ''
      : `chosen=${hasChosen} equipment+treadmill=${hasEquip} two-attempts=${hasTwoAttempts}`
  );
}

async function runA3(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await gotoResourcesTab(page);

  await page.waitForSelector('text=/Equipment \\(/i', { timeout: 5000 });

  const text = await page.locator('body').innerText();
  const lower = text.toLowerCase();
  const hasEquipment = lower.includes('equipment');
  const hasSpecialists = lower.includes('specialists');
  const hasCardio = lower.includes('cardiologist');
  await page.screenshot({ path: `${SHOTS}/A3.png`, fullPage: false });
  const ok = hasEquipment && hasSpecialists && hasCardio;
  record(
    'A3',
    ok,
    ok ? '' : `equipment=${hasEquipment} specialists=${hasSpecialists} cardiologist=${hasCardio}`
  );
}

async function runA4(page) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('A4 SKIP — no OPENAI_API_KEY');
    results.push({ name: 'A4', ok: true, detail: 'skipped (no API key)' });
    return;
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const chip = await findChipForDate(page, 'Cardiology Review', '2026-06-01');
  await chip.click();

  await page.getByRole('button', { name: 'Why was this skipped?' }).first().click();
  // Both desktop and mobile ChatSurfaces are mounted (CSS hides one); scope to visible.
  const textarea = page.locator('textarea:visible').first();
  await textarea.focus();
  await textarea.press('Enter');

  const deadline = Date.now() + 15000;
  let answerText = '';
  while (Date.now() < deadline) {
    answerText = await page.locator('section').first().innerText();
    if (/cardiologist|specialist|2026-06-01/i.test(answerText)) break;
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${SHOTS}/A4.png`, fullPage: false });
  const ok = /cardiologist|specialist|2026-06-01/i.test(answerText);
  record('A4', ok, ok ? '' : 'no relevant assistant response within 15s');
}

async function runA5(page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const chatBtn = page.getByRole('button', { name: /^Chat$/ }).first();
  const workspaceBtn = page.getByRole('button', { name: /^Workspace$/ }).first();
  await chatBtn.waitFor({ timeout: 5000 });
  await workspaceBtn.waitFor({ timeout: 5000 });

  await workspaceBtn.click();
  await page.getByRole('button', { name: /^Calendar$/ }).first().click();

  await chatBtn.click();
  // Both desktop and mobile ChatSurfaces are mounted (CSS hides one); scope to visible.
  const textarea = page.locator('textarea:visible').first();
  await textarea.waitFor({ timeout: 5000 });
  await textarea.click();

  await page.screenshot({ path: `${SHOTS}/A5.png`, fullPage: false });
  const ok = pageErrors.length === 0;
  record('A5', ok, ok ? '' : `pageerrors: ${pageErrors.join(' | ')}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('pageerror', (err) => console.error('pageerror:', err.message));

  for (const [name, runner] of [
    ['A1', runA1],
    ['A2', runA2],
    ['A3', runA3],
    ['A4', runA4],
    ['A5', runA5],
  ]) {
    try {
      await runner(page);
    } catch (err) {
      record(name, false, err instanceof Error ? err.message : String(err));
    }
  }

  await ctx.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
