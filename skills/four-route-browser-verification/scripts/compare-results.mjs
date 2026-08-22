#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import { normalizeUrl, parseArgs, readJson, requiredRoutes, ROUTES, validateRouteRecord, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) throw new Error('usage: node scripts/compare-results.mjs --run <run-dir>');
const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));
const records = [];

for (const route of ROUTES) {
  const file = path.join(runDir, 'routes', route, 'facts.json');
  try {
    await access(file);
    const record = await readJson(file);
    const validationErrors = validateRouteRecord(record, route);
    records.push({ route, file: path.relative(runDir, file), record, validationErrors });
  } catch {
    records.push({ route, file: null, record: null, validationErrors: ['route record is missing'] });
  }
}

const disagreements = [];
const verified = records.filter((item) => item.record?.status === 'Verified' && item.validationErrors.length === 0);

function addMismatch(probe, description, values, severity = 'medium') {
  disagreements.push({ probe, description, severity, byRoute: Object.fromEntries(values.map(({ route, value }) => [route, value])) });
}

function compareExact(probe, description, get, severity = 'medium') {
  const values = verified
    .map(({ route, record }) => ({ route, value: get(record) }))
    .filter(({ value }) => value !== null && value !== undefined);
  if (values.length < 2) return;
  if (new Set(values.map(({ value }) => JSON.stringify(value))).size > 1) addMismatch(probe, description, values, severity);
}

for (const item of verified) {
  if (item.record.target !== run.target) addMismatch('requestedTarget', 'route used a different requested target', [
    { route: 'run', value: run.target },
    { route: item.route, value: item.record.target },
  ], 'high');
  if (item.record.version !== run.version) addMismatch('version', 'route used a different candidate version', [
    { route: 'run', value: run.version },
    { route: item.route, value: item.record.version },
  ], 'high');
}

compareExact('title', 'document title', (record) => record.facts.title, 'low');
compareExact('finalUrl', 'final URL after initial load', (record) => normalizeUrl(record.facts.finalUrl), 'high');
compareExact('uncaughtErrorOccurred', 'whether any uncaught error was observed', (record) => record.facts.uncaughtErrors.length > 0, 'high');
compareExact('consoleErrorOccurred', 'whether any console error was observed', (record) => record.facts.consoleErrors.length > 0, 'medium');
compareExact('visibleControlCount', 'visible interactive control count', (record) => record.facts.visibleControlCount, 'medium');
compareExact('primaryControlResponds', 'whether the authorized primary action changed observable state', (record) => record.facts.primaryControlResponds, 'high');

const textValues = verified
  .map(({ route, record }) => ({ route, value: record.facts.visibleTextLength }))
  .filter(({ value }) => Number.isFinite(value));
if (textValues.length >= 2) {
  const numbers = textValues.map(({ value }) => value);
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  if (high > 0 && (high - low) / high > 0.25) addMismatch('visibleTextLength', 'visible text differs by more than 25%', textValues, 'medium');
}

for (const item of records) {
  if (item.record?.status === 'Verified' && !item.record.facts.screenshotPath) {
    disagreements.push({
      probe: 'screenshotMissing',
      description: `${item.route} did not preserve the screenshot required for visual inspection`,
      severity: 'high',
      byRoute: { [item.route]: null },
    });
  }
}

const routeStates = Object.fromEntries(records.map((item) => [
  item.route,
  item.record?.status ?? 'Not exercised',
]));
// Only the routes this run actually requires count toward completeness.
// Route 3 is satisfied by either ui-test (Browserbase) or brightdata.
const present = records.filter((item) => item.record).map((item) => item.route);
const required = requiredRoutes(present);
const missingOrInvalid = records
  .filter((item) => required.includes(item.route))
  .filter((item) => !item.record || item.validationErrors.length || item.record.status !== 'Verified')
  .map((item) => ({
    route: item.route,
    status: item.record?.status ?? 'Not exercised',
    reasons: item.validationErrors.length ? item.validationErrors : [item.record?.error ?? 'route did not complete'],
  }));

const output = {
  schemaVersion: 1,
  target: run.target,
  version: run.version,
  comparedAt: new Date().toISOString(),
  routeStates,
  requiredRoutes: required,
  completeFourRouteEvidence: missingOrInvalid.length === 0,
  missingOrInvalid,
  disagreements,
  records: records.map((item) => ({
    route: item.route,
    file: item.file,
    status: item.record?.status ?? 'Not exercised',
    validationErrors: item.validationErrors,
  })),
};

await writeJson(path.join(runDir, 'comparison.json'), output);
console.log(JSON.stringify(output, null, 2));
if (disagreements.length) process.exitCode = 2;
else if (missingOrInvalid.length) process.exitCode = 3;
