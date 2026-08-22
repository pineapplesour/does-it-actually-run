#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { emptyFacts, parseArgs, readJson, requireArgs, writeJson } from './common.mjs';

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
requireArgs(args, ['target', 'run'], 'usage: node scripts/agent-browser-probe.mjs --target <url> --run <run-dir> [--state <state-file>] [--allow-action --primary-selector <selector>]');

const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));
const routeDir = path.join(runDir, 'routes', 'agent-browser');
const screenshot = path.join(routeDir, 'full.png');
const session = `four-route-${randomBytes(4).toString('hex')}`;
const started = Date.now();

async function ab(...command) {
  const globalArgs = ['--session', session];
  if (args.state) globalArgs.push('--state', path.resolve(args.state));
  const result = await execFileAsync('agent-browser', [...globalArgs, ...command], {
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function messages(output, kind) {
  if (!output) return [];
  const clean = output.trim();
  const none = kind === 'errors'
    ? /no (page )?errors|no errors found|^\[\]$|^✓$/i
    : /no console (messages|logs)|^\[\]$|^✓$/i;
  if (none.test(clean)) return [];
  return clean.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20);
}

function parseEval(output) {
  const candidates = [output, ...output.split('\n').reverse()];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {}
  }
  throw new Error(`could not parse agent-browser eval output: ${output.slice(0, 300)}`);
}

const record = {
  schemaVersion: 1,
  route: 'agent-browser',
  implementation: 'agent-browser CLI',
  status: 'Blocked',
  target: args.target,
  version: run.version,
  capturedAt: new Date().toISOString(),
  durationMs: null,
  facts: emptyFacts(),
  limitations: [
    'agent-browser errors and console are queried after load; a synchronous initial-load exception may be absent. Cross-check Playwright, which attaches listeners before navigation.',
  ],
  featureCases: [],
  error: null,
  session,
};

try {
  await execFileAsync('agent-browser', ['session', 'list'], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  await ab('open', args.target);
  await ab('wait', '--load', 'networkidle').catch(() => ab('wait', '1200'));
  await ab('snapshot', '-i', '-c');

  const errorsOutput = await ab('errors').catch((error) => `query failed: ${error.message}`);
  const consoleOutput = await ab('console').catch((error) => `query failed: ${error.message}`);
  const measured = parseEval(await ab('eval', `JSON.stringify((() => {
    const visible = element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && box.width > 0 && box.height > 0;
    };
    const controls = [...document.querySelectorAll('button,[role="button"],a[href],input,select,textarea,summary')].filter(visible);
    return {
      title: document.title || '',
      finalUrl: location.href,
      visibleTextLength: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().length,
      visibleControlCount: controls.length
    };
  })())`));

  let primaryControlResponds = null;
  if (args['allow-action'] && args['primary-selector']) {
    const before = parseEval(await ab('eval', 'JSON.stringify({url:location.href,htmlLength:document.body.innerHTML.length})'));
    await ab('click', args['primary-selector']);
    await ab('wait', '800');
    await ab('snapshot', '-i', '-c');
    const after = parseEval(await ab('eval', 'JSON.stringify({url:location.href,htmlLength:document.body.innerHTML.length})'));
    primaryControlResponds = before.url !== after.url || before.htmlLength !== after.htmlLength;
  } else if (args['allow-action'] || args['primary-selector']) {
    record.limitations.push('Primary-control action requires both --allow-action and --primary-selector; no action was taken.');
  }

  await ab('screenshot', screenshot, '--full').catch(() => ab('screenshot', screenshot));
  const screenshotSha256 = createHash('sha256').update(await readFile(screenshot)).digest('hex');
  record.status = 'Verified';
  record.facts = {
    title: measured.title,
    finalUrl: measured.finalUrl,
    uncaughtErrors: messages(errorsOutput, 'errors'),
    consoleErrors: messages(consoleOutput, 'console'),
    visibleTextLength: measured.visibleTextLength,
    visibleControlCount: measured.visibleControlCount,
    primaryControlResponds,
    screenshotPath: path.relative(runDir, screenshot),
    screenshotSha256,
  };
} catch (error) {
  record.error = String(error?.stderr ?? error?.message ?? error).slice(0, 1000);
} finally {
  record.durationMs = Date.now() - started;
  await execFileAsync('agent-browser', ['--session', session, 'close'], { timeout: 20_000 }).catch(() => {});
  await writeJson(path.join(routeDir, 'facts.json'), record);
}

console.log(JSON.stringify(record, null, 2));
if (record.status !== 'Verified') process.exitCode = 2;
