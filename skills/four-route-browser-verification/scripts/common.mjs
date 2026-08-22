import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Route 3 has two interchangeable remote-browser implementations:
// 'ui-test' (Browserbase) and 'brightdata' (Bright Data Scraping Browser).
// A run needs exactly one of them, not both.
export const ROUTE_3_ALTERNATIVES = ['ui-test', 'brightdata'];
export const ROUTES = ['playwright', 'agent-browser', 'ui-test', 'brightdata', 'dogfood'];

// Which routes must be present for four-route completeness.
export function requiredRoutes(present = []) {
  const remote = ROUTE_3_ALTERNATIVES.find((r) => present.includes(r)) || 'ui-test';
  return ['playwright', 'agent-browser', remote, 'dogfood'];
}
export const STATES = ['Verified', 'Failed', 'Not exercised', 'Blocked'];

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      out._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function requireArgs(args, names, usage) {
  const missing = names.filter((name) => !args[name]);
  if (missing.length) {
    throw new Error(`${usage}\nmissing: ${missing.map((name) => `--${name}`).join(', ')}`);
  }
}

export function emptyFacts() {
  return {
    title: null,
    finalUrl: null,
    uncaughtErrors: [],
    consoleErrors: [],
    visibleTextLength: null,
    visibleControlCount: null,
    primaryControlResponds: null,
    screenshotPath: null,
    screenshotSha256: null,
  };
}

export function validateRouteRecord(record, expectedRoute = null) {
  const errors = [];
  if (!ROUTES.includes(record?.route)) errors.push(`route must be one of: ${ROUTES.join(', ')}`);
  if (expectedRoute && record?.route !== expectedRoute) errors.push(`route must equal ${expectedRoute}`);
  if (!STATES.includes(record?.status)) errors.push(`status must be one of: ${STATES.join(', ')}`);
  if (typeof record?.target !== 'string' || !record.target) errors.push('target is required');
  if (typeof record?.version !== 'string' || !record.version) errors.push('version is required');
  if (!record?.capturedAt || Number.isNaN(Date.parse(record.capturedAt))) errors.push('capturedAt must be an ISO timestamp');
  if (!record?.facts || typeof record.facts !== 'object') errors.push('facts is required');
  else {
    for (const key of Object.keys(emptyFacts())) {
      if (!(key in record.facts)) errors.push(`facts.${key} is required, even when null`);
    }
    if (!Array.isArray(record.facts.uncaughtErrors)) errors.push('facts.uncaughtErrors must be an array');
    if (!Array.isArray(record.facts.consoleErrors)) errors.push('facts.consoleErrors must be an array');
  }
  if (!Array.isArray(record?.limitations)) errors.push('limitations must be an array');
  if (!Array.isArray(record?.featureCases)) errors.push('featureCases must be an array');
  for (const [index, item] of (record?.featureCases ?? []).entries()) {
    if (!item.id || !item.name) errors.push(`featureCases[${index}] needs id and name`);
    if (!STATES.includes(item.status)) errors.push(`featureCases[${index}].status is invalid`);
  }
  return errors;
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return value;
  }
}
