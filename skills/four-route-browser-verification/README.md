# Four-Route Browser Verification

A portable Codex skill and code bundle for reproducible front-end verification across:

1. Playwright
2. agent-browser
3. Browserbase `ui-test` through the `browse` CLI
4. `dogfood` exploratory testing

It also runs a zero-model deterministic sweep before those routes. The four items are verification routes, not four independent browser engines: `dogfood` itself drives `agent-browser`.

## Quick start

```sh
cd /path/to/four-route-browser-verification
npm install
./scripts/preflight.sh

node scripts/init-run.mjs \
  --target http://127.0.0.1:3000 \
  --out ./evidence/run-001 \
  --version local-candidate

./scripts/run-deterministic.sh \
  http://127.0.0.1:3000 \
  ./evidence/run-001 \
  --read-only

./scripts/run-machine-routes.sh \
  http://127.0.0.1:3000 \
  ./evidence/run-001
```

Then run the `ui-test` and `dogfood` routes using `references/route-guides.md`, save their normalized JSON with `scripts/record-route-result.mjs`, and build the cross-route report:

```sh
node scripts/compare-results.mjs --run ./evidence/run-001
node scripts/build-report.mjs --run ./evidence/run-001
open ./evidence/run-001/report/index.html
```

## What is included

- Agent-facing `SKILL.md`
- Human-facing workflow and route documentation
- Exact JSON evidence contract and templates
- Vendored deterministic sweep
- Playwright and agent-browser probes
- Cross-route comparator and offline HTML report generator
- Seeded fixture and package self-test

The package defaults to read-only observation. It does not authorize external sends, destructive controls, purchases, publishing, production changes, or other live side effects.

## Installation scope

This is a standalone download copy. It does not modify the machine-global skill catalog, Codex discovery roots, browser configuration, or an application repository. To install it later, copy or link the reviewed folder into the desired runtime's skill root.
