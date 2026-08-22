---
name: four-route-browser-verification
description: Verify a web UI through a deterministic viewport sweep plus Playwright, agent-browser, Browserbase ui-test, and dogfood routes, then reconcile evidence and expose disagreements. Use for high-confidence UI QA, accessibility and responsive audits, end-to-end feature verification, or review candidates that must be reproducible. Do not use for source-only review or as permission to trigger live external side effects.
---

# Four-Route Browser Verification

Treat this as four verification routes, not four fully independent browser implementations. `dogfood` uses `agent-browser` underneath; `ui-test` normally uses the `browse` CLI and Browserbase for deployed targets. Independence comes from different observation and testing workflows, not merely four browser binaries.

## Before testing

Resolve and record:

- Exact target URL or static directory, owning project, version/commit, and review candidate.
- User-requested outcome, feature inventory, expected results, regression surface, and historical baseline.
- Authentication state and the identity being exercised, without copying credential values into evidence.
- Side-effect mode: default `read-only`; use `actions` only for explicitly authorized reversible tests. A live send, publish, purchase, deletion, or production mutation still needs send-specific approval.
- Evidence directory. Never mix artifacts from different targets or versions.

Read [references/workflow.md](references/workflow.md) for every run. Read [references/auth-and-side-effects.md](references/auth-and-side-effects.md) for authenticated or mutable targets. Read [references/route-guides.md](references/route-guides.md) before executing a route. Read [references/known-limitations.md](references/known-limitations.md) before interpreting findings.

## Required workflow

1. Run `scripts/preflight.sh`. Reduce browser concurrency when the host is under memory pressure.
2. Initialize an evidence run with `node scripts/init-run.mjs --target <target> --out <run-dir> --version <id>`. Preserve the generated `run.json` and complete `feature-inventory.md` before testing.
3. Start the reviewed application freshly. Record the start command and observed URL. Do not rely on a warm browser or stale server.
4. Run the deterministic sweep first with `scripts/run-deterministic.sh <target> <run-dir> [--read-only]`. Its nonzero exit code is the number of findings, not an infrastructure crash.
5. Run the Playwright and agent-browser factual probes using `scripts/run-machine-routes.sh <target> <run-dir>`. They default to observation only.
6. Execute the Browserbase `ui-test` route and the `dogfood` route as described in [references/route-guides.md](references/route-guides.md). Normalize both with `scripts/record-route-result.mjs`; never invent a result for an unavailable route.
7. Ask every route the same factual questions: title, final URL, initial-load uncaught errors, console errors, visible-text length, visible-control count, primary-control response when authorized, and screenshot identity. A route's silence is not proof of absence.
8. Exercise every touched feature end to end: before state, action, after state, persisted or receiving-end effect. Drive delayed behavior by injecting time or invoking the scheduled path. Recheck at least one unrelated feature.
9. At each relevant viewport, follow `shoot -> read -> judge -> fix -> shoot again`. Inspect screenshots as images; arithmetic cannot establish hierarchy, first impression, or visual sameness.
10. Run `node scripts/compare-results.mjs --run <run-dir>` and `node scripts/build-report.mjs --run <run-dir>`. Treat route disagreement as a measurement finding to investigate, not a vote to resolve by majority.

## Evidence rules

- Use only `Verified`, `Failed`, `Not exercised`, or `Blocked` for routes and feature cases.
- Every pass names an observable fact. Every failure includes expected versus actual, exact reproduction steps, and evidence captured at the broken state.
- Capture interactive defects with before/action/after evidence; static visual defects need an annotated screenshot and exact viewport.
- Preserve original and candidate evidence side by side when comparison matters.
- Show unverified stages on the first screen of the report. Do not blend them into confident summary counts.
- Never claim four-route completion unless all four route records exist for the same target/version. State route unavailability explicitly.
- Never claim the feature works when only a build, smoke test, harness, or success message passed.

## Completion gate

A run is complete only when the report identifies the exact target and version, all feature cases are classified, all required routes are classified, disagreements are resolved or openly carried, screenshots were visually inspected, the real user path was exercised where authorized, delayed stages were driven, and a cold-start reproduction was performed. Keep the main/canonical target unchanged until the reviewed candidate is separately approved for promotion.

## Included code

- `scripts/vendor/gauntlet-verify.mjs`: deterministic 16-width geometry, runtime, focus, contrast, control, dependency, and print sweep.
- `scripts/playwright-probe.mjs`: pre-navigation error listeners and factual Playwright evidence.
- `scripts/agent-browser-probe.mjs`: named-session snapshot, screenshot, console/error, and factual evidence.
- `scripts/record-route-result.mjs`: validates and records `ui-test` and `dogfood` evidence.
- `scripts/compare-results.mjs`: identifies missing routes and cross-route disagreement.
- `scripts/build-report.mjs`: creates an offline, first-screen verification report.
- `scripts/self-test.sh`: checks package syntax and runs the seeded fixture when dependencies exist.
