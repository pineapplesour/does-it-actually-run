#!/usr/bin/env node
/**
 * Route 3 (Bright Data Scraping Browser) — drop-in replacement for the
 * Browserbase `ui-test` route.
 *
 * Emits the same evidence contract as playwright-probe.mjs so
 * compare-results.mjs can reconcile it against the other routes.
 *
 * Why this is a genuinely independent route, not a fourth browser binary:
 * the local routes all observe the target from this machine's network.
 * This route observes it from Bright Data's remote egress. That difference
 * is what catches localhost-only bindings, geo-restrictions, CDN/edge
 * failures, and bot-blocking that the local routes cannot see by design.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { emptyFacts, parseArgs, readJson, requireArgs, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
requireArgs(args, ['target', 'run'],
  'usage: node scripts/brightdata-probe.mjs --target <url> --run <run-dir> [--cdp <wss-url>]');

const cdp = args.cdp || process.env.BRIGHTDATA_CDP_URL;
const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));
const routeDir = path.join(runDir, 'routes', 'brightdata');
await mkdir(routeDir, { recursive: true });
const screenshot = path.join(routeDir, 'full.png');
const started = Date.now();
const uncaughtErrors = [];
const consoleErrors = [];
let browser;

const record = {
  schemaVersion: 1,
  route: 'brightdata',
  implementation: 'playwright/bright-data-scraping-browser (remote CDP)',
  status: 'Blocked',
  target: args.target,
  version: run.version,
  capturedAt: new Date().toISOString(),
  durationMs: null,
  facts: emptyFacts(),
  limitations: [],
  featureCases: [],
  error: null,
};

if (!cdp) {
  record.status = 'Blocked';
  record.error = 'BRIGHTDATA_CDP_URL is not set; the remote browser route could not start.';
  await writeJson(path.join(routeDir, 'facts.json'), record);
  console.error(record.error);
  process.exit(1);
}

try {
  // Remote browser: the connection itself is the network-vantage difference.
  browser = await chromium.connectOverCDP(cdp, { timeout: 120_000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', (e) => uncaughtErrors.push(`${e.name}: ${e.message}`.slice(0, 500)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 500));
  });

  await page.goto(args.target, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(1500);

  const measured = await page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden'
        && Number(s.opacity) > 0.05 && b.width > 0 && b.height > 0;
    };
    const controls = [...document.querySelectorAll(
      'button,[role="button"],a[href],input,select,textarea,summary')].filter(visible);
    return {
      title: document.title || '',
      finalUrl: location.href,
      visibleTextLength: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
      visibleControlCount: controls.length,
    };
  });

  await page.screenshot({ path: screenshot, fullPage: true });
  const sha = createHash('sha256').update(await readFile(screenshot)).digest('hex');

  record.status = 'Verified';
  record.facts = {
    title: measured.title,
    finalUrl: measured.finalUrl,
    uncaughtErrors,
    consoleErrors,
    visibleTextLength: measured.visibleTextLength,
    visibleControlCount: measured.visibleControlCount,
    primaryControlResponds: null,
    screenshotPath: path.relative(runDir, screenshot),
    screenshotSha256: sha,
  };
  record.limitations.push(
    'Observed from Bright Data remote egress, not from the local network. A target bound to localhost or restricted by geo/IP is unreachable here by design; treat unreachability as a finding about exposure, not proof the app is broken.');
  record.limitations.push(
    'Error listeners attach after the remote browser session exists; a synchronous exception thrown before attach can be missed. Cross-check the playwright route.');
} catch (e) {
  record.status = 'Failed';
  record.error = `${e.name}: ${e.message}`.slice(0, 800);
} finally {
  record.durationMs = Date.now() - started;
  if (browser) { try { await browser.close(); } catch {} }
  await writeJson(path.join(routeDir, 'facts.json'), record);
}

console.log(`${record.route}: ${record.status}${record.error ? ` — ${record.error}` : ''}`);
process.exit(record.status === 'Verified' ? 0 : 1);
