#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { emptyFacts, parseArgs, readJson, requireArgs, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
requireArgs(args, ['target', 'run'], 'usage: node scripts/playwright-probe.mjs --target <url> --run <run-dir> [--state <storage-state>] [--allow-action --primary-selector <css>]');

const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));
const routeDir = path.join(runDir, 'routes', 'playwright');
const screenshot = path.join(routeDir, 'full.png');
const started = Date.now();
const uncaughtErrors = [];
const consoleErrors = [];
let browser;

const record = {
  schemaVersion: 1,
  route: 'playwright',
  implementation: 'playwright/chromium',
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

try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(args.state ? { storageState: path.resolve(args.state) } : {}),
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => uncaughtErrors.push(`${error.name}: ${error.message}`.slice(0, 500)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
  });

  await page.goto(args.target, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(1200);
  const measured = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && box.width > 0 && box.height > 0;
    };
    const controls = [...document.querySelectorAll('button,[role="button"],a[href],input,select,textarea,summary')].filter(visible);
    return {
      title: document.title || '',
      finalUrl: location.href,
      visibleTextLength: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
      visibleControlCount: controls.length,
    };
  });

  let primaryControlResponds = null;
  if (args['allow-action'] && args['primary-selector']) {
    const before = await page.evaluate(() => ({ url: location.href, htmlLength: document.body.innerHTML.length }));
    let requests = 0;
    const onRequest = () => { requests += 1; };
    page.on('request', onRequest);
    await page.locator(args['primary-selector']).first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    page.off('request', onRequest);
    const after = await page.evaluate(() => ({ url: location.href, htmlLength: document.body.innerHTML.length }));
    primaryControlResponds = before.url !== after.url || before.htmlLength !== after.htmlLength || requests > 0;
  } else if (args['allow-action'] || args['primary-selector']) {
    record.limitations.push('Primary-control action requires both --allow-action and --primary-selector; no action was taken.');
  }

  await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotSha256 = createHash('sha256').update(await readFile(screenshot)).digest('hex');
  record.status = 'Verified';
  record.facts = {
    title: measured.title,
    finalUrl: measured.finalUrl,
    uncaughtErrors,
    consoleErrors,
    visibleTextLength: measured.visibleTextLength,
    visibleControlCount: measured.visibleControlCount,
    primaryControlResponds,
    screenshotPath: path.relative(runDir, screenshot),
    screenshotSha256,
  };
} catch (error) {
  record.error = String(error?.message ?? error).slice(0, 1000);
  record.facts.uncaughtErrors = uncaughtErrors;
  record.facts.consoleErrors = consoleErrors;
} finally {
  record.durationMs = Date.now() - started;
  await browser?.close().catch(() => {});
  await writeJson(path.join(routeDir, 'facts.json'), record);
}

console.log(JSON.stringify(record, null, 2));
if (record.status !== 'Verified') process.exitCode = 2;
