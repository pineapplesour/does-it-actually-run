#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, ROUTES, writeJson } from '../scripts/common.mjs';

const runDir = process.argv[2];
if (!runDir) throw new Error('usage: node tests/comparator-self-test.mjs <run-dir>');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const comparator = path.join(root, 'scripts', 'compare-results.mjs');
const source = await readJson(path.join(runDir, 'routes', 'playwright', 'facts.json'));

for (const route of ROUTES) {
  const record = structuredClone(source);
  record.route = route;
  record.implementation = `self-test clone for ${route}`;
  record.limitations = route === 'dogfood' ? ['Self-test clone; dogfood normally shares agent-browser transport.'] : [];
  await writeJson(path.join(runDir, 'routes', route, 'facts.json'), record);
}

let result = spawnSync(process.execPath, [comparator, '--run', runDir], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`agreement fixture should pass comparator: ${result.stdout}\n${result.stderr}`);

const dogfoodFile = path.join(runDir, 'routes', 'dogfood', 'facts.json');
const dogfood = await readJson(dogfoodFile);
dogfood.facts.title = 'Deliberate disagreement';
await writeJson(dogfoodFile, dogfood);
result = spawnSync(process.execPath, [comparator, '--run', runDir], { encoding: 'utf8' });
if (result.status !== 2 || !result.stdout.includes('"probe": "title"')) {
  throw new Error(`title disagreement was not detected: ${result.stdout}\n${result.stderr}`);
}

dogfood.facts.title = source.facts.title;
await writeJson(dogfoodFile, dogfood);
result = spawnSync(process.execPath, [comparator, '--run', runDir], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('comparator did not recover after restoring agreement');
console.log('comparator agreement and disagreement checks passed');
