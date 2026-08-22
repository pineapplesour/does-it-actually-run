#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, requireArgs, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
requireArgs(
  args,
  ['target', 'out', 'version'],
  'usage: node scripts/init-run.mjs --target <url-or-dir> --out <run-dir> --version <id> [--mode read-only|actions] [--baseline <id>]'
);

const mode = args.mode ?? 'read-only';
if (!['read-only', 'actions'].includes(mode)) throw new Error('--mode must be read-only or actions');

const outDir = path.resolve(args.out);
const runFile = path.join(outDir, 'run.json');
try {
  await access(runFile);
  throw new Error(`refusing to overwrite existing run: ${runFile}`);
} catch (error) {
  if (error.message.startsWith('refusing')) throw error;
}

for (const dir of [
  'deterministic',
  'routes/playwright',
  'routes/agent-browser',
  'routes/ui-test',
  'routes/dogfood',
  'report',
]) {
  await mkdir(path.join(outDir, dir), { recursive: true });
}

const run = {
  schemaVersion: 1,
  target: args.target,
  version: args.version,
  baseline: args.baseline ?? null,
  mode,
  initializedAt: new Date().toISOString(),
  coldStart: {
    status: 'Not exercised',
    startCommand: null,
    observedUrl: null,
    notes: null,
  },
  screenshotInspection: {
    status: 'Not exercised',
    inspectedBy: null,
    notes: null,
  },
  delayedBehavior: {
    status: 'Not exercised',
    method: null,
    notes: null,
  },
};
await writeJson(runFile, run);

const inventory = `# Feature inventory\n\nTarget: ${args.target}\nVersion: ${args.version}\nBaseline: ${args.baseline ?? 'none recorded'}\nMode: ${mode}\n\nComplete this before testing. Use only Verified, Failed, Not exercised, or Blocked.\n\n| ID | Feature or user sequence | Expected observable result | Regression? | Status | Evidence |\n|---|---|---|---|---|---|\n| F-001 | Replace with the primary requested flow | Replace with a falsifiable result | No | Not exercised | |\n| R-001 | Replace with one unrelated regression flow | Replace with a falsifiable result | Yes | Not exercised | |\n\n## Time-dependent stages\n\n| ID | Delayed stage | How time will be driven | Expected observable result | Status | Evidence |\n|---|---|---|---|---|---|\n| T-001 | None recorded | N/A | N/A | Not exercised | |\n`;
await writeFile(path.join(outDir, 'feature-inventory.md'), inventory);

console.log(outDir);
