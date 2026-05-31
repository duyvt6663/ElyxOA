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
  const chip = page.getByRole('button', { name: 'Select Cardiology Review on 2026-06-01' }).first();
  await chip.waitFor({ timeout: 10000 });
  await chip.click();
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
  // Open the first day with a "+N more" to reveal the DayTimeline.
  const more = page.locator('button:has-text("more")').first();
  await more.waitFor({ timeout: 8000 });
  await more.click();
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
  const chip = page.getByRole('button', { name: /^Select / }).first();
  await chip.waitFor({ timeout: 8000 });
  await chip.click();
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
