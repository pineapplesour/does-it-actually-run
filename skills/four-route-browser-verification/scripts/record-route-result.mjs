#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, readJson, requireArgs, validateRouteRecord, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
requireArgs(args, ['run', 'route', 'input'], 'usage: node scripts/record-route-result.mjs --run <run-dir> --route ui-test|dogfood --input <result.json> [--replace]');
if (!['ui-test', 'dogfood'].includes(args.route)) throw new Error('This recorder is for ui-test and dogfood route results. Machine probes write their own records.');

const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));
const record = await readJson(path.resolve(args.input));
const errors = validateRouteRecord(record, args.route);
if (record.target !== run.target) errors.push(`target mismatch: run=${run.target}, result=${record.target}`);
if (record.version !== run.version) errors.push(`version mismatch: run=${run.version}, result=${record.version}`);
if (errors.length) throw new Error(`invalid route record:\n- ${errors.join('\n- ')}`);

const destination = path.join(runDir, 'routes', args.route, 'facts.json');
if (!args.replace) {
  try {
    await access(destination);
    throw new Error(`refusing to overwrite ${destination}; pass --replace only after confirming this is the same target and review candidate`);
  } catch (error) {
    if (error.message.startsWith('refusing')) throw error;
  }
}

await writeJson(destination, record);
console.log(destination);
