#!/usr/bin/env node
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, readJson, ROUTES } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) throw new Error('usage: node scripts/build-report.mjs --run <run-dir>');
const runDir = path.resolve(args.run);
const run = await readJson(path.join(runDir, 'run.json'));

async function optionalJson(file, fallback) {
  try {
    await access(file);
    return await readJson(file);
  } catch {
    return fallback;
  }
}

const comparison = await optionalJson(path.join(runDir, 'comparison.json'), null);
if (!comparison) throw new Error('comparison.json is missing; run compare-results.mjs first');
const deterministic = await optionalJson(path.join(runDir, 'deterministic', 'result.json'), { findings: [] });
const routeRecords = {};
for (const route of ROUTES) {
  routeRecords[route] = await optionalJson(path.join(runDir, 'routes', route, 'facts.json'), null);
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const list = (items) => items?.length ? `<ul>${items.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`).join('')}</ul>` : '<span class="muted">None observed</span>';

const featureCases = Object.values(routeRecords).flatMap((record) => record?.featureCases ?? []);
const anyFeatureFailed = featureCases.some((item) => item.status === 'Failed');
const incomplete = !comparison.completeFourRouteEvidence || featureCases.length === 0;
const failed = deterministic.findings.length > 0 || comparison.disagreements.length > 0 || anyFeatureFailed;
const overall = failed ? 'Failed' : incomplete ? 'Not exercised' : 'Verified';

const routeCards = ROUTES.map((route) => {
  const record = routeRecords[route];
  const state = record?.status ?? 'Not exercised';
  return `<article class="route ${state.toLowerCase().replace(/\s+/g, '-')}">
    <h3>${escapeHtml(route)}</h3>
    <strong>${escapeHtml(state)}</strong>
    <p>${record ? `${escapeHtml(record.implementation)} · ${escapeHtml(record.durationMs)} ms` : 'No route record'}</p>
    ${record?.error ? `<p class="error">${escapeHtml(record.error)}</p>` : ''}
  </article>`;
}).join('');

const factRows = ROUTES.map((route) => {
  const facts = routeRecords[route]?.facts;
  return `<tr>
    <th>${escapeHtml(route)}</th>
    <td>${escapeHtml(facts?.title ?? '—')}</td>
    <td>${escapeHtml(facts?.finalUrl ?? '—')}</td>
    <td>${escapeHtml(facts ? facts.uncaughtErrors.length : '—')}</td>
    <td>${escapeHtml(facts ? facts.consoleErrors.length : '—')}</td>
    <td>${escapeHtml(facts?.visibleTextLength ?? '—')}</td>
    <td>${escapeHtml(facts?.visibleControlCount ?? '—')}</td>
    <td>${escapeHtml(facts?.primaryControlResponds ?? 'Not exercised')}</td>
  </tr>`;
}).join('');

const disagreementCards = comparison.disagreements.length
  ? comparison.disagreements.map((item) => `<article class="finding"><strong>${escapeHtml(item.severity)} · ${escapeHtml(item.probe)}</strong><p>${escapeHtml(item.description)}</p><pre>${escapeHtml(JSON.stringify(item.byRoute, null, 2))}</pre></article>`).join('')
  : '<p class="ok">No recorded cross-route disagreement.</p>';
const deterministicCards = deterministic.findings.length
  ? deterministic.findings.map((item) => `<article class="finding"><strong>${escapeHtml(item.severity)} · ${escapeHtml(item.id)}</strong><p>${escapeHtml(item.claim)}</p><p>${escapeHtml(item.evidence)}</p></article>`).join('')
  : '<p class="ok">No deterministic finding recorded.</p>';
const featureRows = featureCases.length
  ? featureCases.map((item) => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.evidence ?? '')}</td></tr>`).join('')
  : '<tr><td colspan="4">Not exercised — no structured end-to-end feature cases were recorded.</td></tr>';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Browser verification · ${escapeHtml(run.version)}</title>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#172033;background:#f3f5f8}body{margin:0}.wrap{max-width:1180px;margin:auto;padding:32px}header,.panel{background:white;border:1px solid #d8dee8;border-radius:14px;padding:24px;margin-bottom:20px}.eyebrow{letter-spacing:.08em;text-transform:uppercase;color:#5b6475;font-size:12px}.status{display:inline-block;padding:7px 11px;border-radius:999px;background:#172033;color:white}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.route{border:1px solid #d8dee8;border-radius:12px;padding:16px}.route h3{margin:0 0 8px}.verified{border-left:5px solid #198754}.failed{border-left:5px solid #c63f3f}.blocked,.not-exercised{border-left:5px solid #aa7621}.muted{color:#687386}.error{color:#9f2424}.ok{color:#0d6b42}.finding{border-left:4px solid #c47a25;padding:8px 14px;margin:12px 0;background:#fff8ec}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e1e5eb;padding:10px;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fa;padding:12px;border-radius:8px}@media(max-width:800px){.summary{grid-template-columns:1fr 1fr}.wrap{padding:16px}}@media print{body{background:white}.wrap{max-width:none}.panel,header{break-inside:avoid}}
</style></head><body><main class="wrap">
<header><div class="eyebrow">Four-route browser verification</div><h1>${escapeHtml(run.version)}</h1><p><strong>Target:</strong> ${escapeHtml(run.target)}</p><p><span class="status">${escapeHtml(overall)}</span> · Generated ${escapeHtml(new Date().toISOString())}</p><p>This status is conservative: deterministic findings, unresolved disagreement, missing routes, or absent user-path evidence prevent a clean verification.</p></header>
<section class="panel"><h2>At a glance</h2><div class="summary">${routeCards}</div><p><strong>Deterministic findings:</strong> ${deterministic.findings.length} · <strong>Disagreements:</strong> ${comparison.disagreements.length} · <strong>Feature cases:</strong> ${featureCases.length}</p><p><strong>Cold start:</strong> ${escapeHtml(run.coldStart.status)} · <strong>Screenshot inspection:</strong> ${escapeHtml(run.screenshotInspection.status)} · <strong>Delayed behavior:</strong> ${escapeHtml(run.delayedBehavior.status)}</p></section>
<section class="panel"><h2>Same factual questions</h2><div style="overflow:auto"><table><thead><tr><th>Route</th><th>Title</th><th>Final URL</th><th>Uncaught</th><th>Console</th><th>Text length</th><th>Controls</th><th>Primary response</th></tr></thead><tbody>${factRows}</tbody></table></div></section>
<section class="panel"><h2>Cross-route disagreements</h2>${disagreementCards}</section>
<section class="panel"><h2>Deterministic sweep</h2>${deterministicCards}</section>
<section class="panel"><h2>End-to-end feature cases</h2><table><thead><tr><th>ID</th><th>Case</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${featureRows}</tbody></table></section>
<section class="panel"><h2>Known limitations carried by routes</h2>${ROUTES.map((route) => `<h3>${escapeHtml(route)}</h3>${list(routeRecords[route]?.limitations ?? [])}`).join('')}</section>
</main></body></html>`;

const reportFile = path.join(runDir, 'report', 'index.html');
await writeFile(reportFile, html);
console.log(reportFile);
