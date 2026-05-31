// 015 ACCEPTANCE SUITE — standalone Playwright drive script (temporal scheduler + calendar).
//
// To run: 1) npm run dev (in another shell). 2) node tests/drive-acceptance.mjs
//
// Cases:
// A1: Jun 1 Cardiology Review skipped chip -> Trace tab -> 'specialist' + 'cardiologist' (resource demo preserved).
// A2: Calendar month-overview density — no day-cell renders more than 8 chip nodes (015 #1 fix).
// A3: Open a day -> DayTimeline shows occupied member blocks; "Show occupied slots" toggle hides them.
// A4: Resources tab -> cardiologist + treadmill rows present.
// A5: Select an occurrence -> ask a timing question -> chat answer is temporally grounded (HH:MM / busy block). SKIP w/o key.
// A6: Resize to 360x800 -> MobileSwitch buttons visible, no page errors.
// A7 (020): clicking the "Scheduled" summary pill opens its glossary tooltip.
// A8 (020): first-run tour prompt -> Start -> 5 steps -> Finish; reload -> prompt gone (localStorage).
// A9 (020): the header Help control opens the Help & glossary panel.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000/';
const SHOTS = '/tmp/elyx-015-acceptance';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function gotoTab(page, name) {
  await page.getByRole('button', { name: new RegExp(`^${name}$`) }).first().click();
}

async function runA1(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Open the Jun 1 cell -> day timeline, then click the skipped Cardiology Review.
  const cell = page.locator('[data-testid="day-cell-chips"]').first();
  await cell.waitFor({ timeout: 10000 });
  await cell.click();
  await page.waitForTimeout(600);
  const skip = page.getByRole('button', { name: /Cardiology Review/ }).first();
  await skip.waitFor({ timeout: 5000 });
  await skip.click();
  await gotoTab(page, 'Trace');
  await page.waitForSelector('text=occ-act-003-2026-06-01', { timeout: 5000 });
  const lower = (await page.locator('body').innerText()).toLowerCase();
  const ok = lower.includes('specialist') && lower.includes('cardiologist');
  await page.screenshot({ path: `${SHOTS}/A1.png` });
  record('A1', ok, ok ? '' : 'expected specialist + cardiologist in trace');
}

async function runA2(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="day-cell-chips"]', { timeout: 8000 });
  const counts = await page.$$eval('[data-testid="day-cell-chips"]', (els) => els.map((e) => e.children.length));
  const max = Math.max(...counts);
  await page.screenshot({ path: `${SHOTS}/A2.png` });
  record('A2', max <= 8, max <= 8 ? `max ${max} chip nodes/cell` : `a cell rendered ${max} > 8 chip nodes`);
}

async function runA3(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Click a day cell to reveal the DayTimeline.
  const cell = page.locator('[data-testid="day-cell-chips"]').first();
  await cell.waitFor({ timeout: 8000 });
  await cell.click();
  await page.waitForTimeout(600);
  const toggle = page.getByText('Show occupied slots').first();
  await toggle.waitFor({ timeout: 5000 });
  const busyOn = await page.$$eval('aside [title]', (els) =>
    els.filter((e) => /\((sleep|work|commute|meal|family|travel|personal|clinical)\)/.test(e.getAttribute('title') || '')).length,
  );
  await toggle.click();
  await page.waitForTimeout(400);
  const busyOff = await page.$$eval('aside [title]', (els) =>
    els.filter((e) => /\((sleep|work|commute|meal|family|travel|personal|clinical)\)/.test(e.getAttribute('title') || '')).length,
  );
  await page.screenshot({ path: `${SHOTS}/A3.png` });
  const ok = busyOn > 0 && busyOff === 0;
  record('A3', ok, ok ? `${busyOn} busy bars -> 0 after toggle` : `busyOn=${busyOn} busyOff=${busyOff}`);
}

async function runA4(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await gotoTab(page, 'Resources');
  await page.waitForSelector('text=/Equipment \\(/i', { timeout: 5000 });
  const lower = (await page.locator('body').innerText()).toLowerCase();
  const ok = lower.includes('cardiologist') && lower.includes('treadmill');
  await page.screenshot({ path: `${SHOTS}/A4.png` });
  record('A4', ok, ok ? '' : `cardiologist=${lower.includes('cardiologist')} treadmill=${lower.includes('treadmill')}`);
}

async function runA5(page) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('A5 SKIP — no OPENAI_API_KEY');
    results.push({ name: 'A5', ok: true, detail: 'skipped (no API key)' });
    return;
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Open a day timeline and select a scheduled action bar.
  const cell = page.locator('[data-testid="day-cell-chips"]').first();
  await cell.waitFor({ timeout: 8000 });
  await cell.click();
  await page.waitForTimeout(1200); // let the DayDetail scroll-into-view animation settle
  // Select via a real leaf action row (type-dot, no chevron) — not a bundle/group toggle.
  // 018: the time moved to the group header, so rows no longer carry a mono timestamp.
  const action = page
    .locator('aside li button')
    .filter({ has: page.locator('span.rounded-full') })
    .filter({ hasNot: page.locator('span.w-3') })
    .first();
  await action.waitFor({ timeout: 5000 });
  await action.click({ force: true });
  await page.waitForTimeout(300);
  const ta = page.locator('textarea:visible').first();
  await ta.click();
  await ta.fill('What time is this scheduled, and what was the member busy with around then?');
  await ta.press('Enter');
  const deadline = Date.now() + 20000;
  let ans = '';
  while (Date.now() < deadline) {
    ans = await page.locator('section').first().innerText();
    if (/\d\d:\d\d|work|commute|sleep|family|breakfast|lunch|dinner|occupied/i.test(ans)) break;
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SHOTS}/A5.png` });
  const ok = /\d\d:\d\d|work|commute|sleep|family|breakfast|lunch|dinner|occupied/i.test(ans);
  record('A5', ok, ok ? '' : 'no temporally-grounded chat answer within 20s');
}

async function runA6(page) {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const chatBtn = page.getByRole('button', { name: /^Chat$/ }).first();
  const workspaceBtn = page.getByRole('button', { name: /^Workspace$/ }).first();
  await chatBtn.waitFor({ timeout: 5000 });
  await workspaceBtn.waitFor({ timeout: 5000 });
  await workspaceBtn.click();
  await gotoTab(page, 'Calendar');
  await page.screenshot({ path: `${SHOTS}/A6.png` });
  record('A6', pageErrors.length === 0, pageErrors.length === 0 ? '' : `pageerrors: ${pageErrors.join(' | ')}`);
}

// A7 (020): clicking the "Scheduled" summary pill opens its glossary tooltip.
async function runA7(page) {
  await page.setViewportSize({ width: 1280, height: 800 }); // A6 left it at mobile; reset to desktop
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const sched = page.locator('[role="button"]', { hasText: /Scheduled ·/ }).first();
  await sched.waitFor({ timeout: 8000 });
  await sched.click();
  await page.waitForTimeout(250);
  const ok = await page
    .getByRole('tooltip')
    .filter({ hasText: /placed on the calendar as planned/i })
    .first()
    .isVisible()
    .catch(() => false);
  await page.screenshot({ path: `${SHOTS}/A7.png` });
  record('A7', ok, ok ? 'glossary tooltip opens' : 'tooltip did not open');
}

// A8 (020): first-run tour prompt → Start → 5 steps → Finish; reload → prompt does not reappear.
async function runA8(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const start = page.getByRole('button', { name: /Start tour/i }).first();
  await start.waitFor({ timeout: 8000 });
  await start.click();
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole('button', { name: /^Next$/ }).first();
    await next.waitFor({ timeout: 5000 });
    await next.click();
    await page.waitForTimeout(450);
  }
  const finish = page.getByRole('button', { name: /^Finish$/ }).first();
  const reachedFinish = await finish.isVisible().catch(() => false);
  if (reachedFinish) await finish.click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const promptGone = !(await page.getByText(/Take a 90-second tour/i).first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/A8.png` });
  const ok = reachedFinish && promptGone;
  record('A8', ok, ok ? '5 steps + localStorage persists' : `reachedFinish=${reachedFinish} promptGone=${promptGone}`);
}

// A9 (020): the header Help control opens the Help & glossary panel.
async function runA9(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const help = page.getByRole('button', { name: /Help/i }).first();
  await help.waitFor({ timeout: 8000 });
  await help.click();
  await page.waitForTimeout(250);
  const ok = await page.getByRole('dialog', { name: /Help and glossary/i }).isVisible().catch(() => false);
  await page.screenshot({ path: `${SHOTS}/A9.png` });
  record('A9', ok, ok ? 'help panel opens' : 'help panel did not open');
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
    ['A6', runA6],
    ['A7', runA7],
    ['A8', runA8],
    ['A9', runA9],
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
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
