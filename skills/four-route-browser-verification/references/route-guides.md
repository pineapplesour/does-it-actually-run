# Route guides

All routes must use the target and version from `run.json`. Run them from fresh sessions unless an authenticated state-only session is explicitly required.

## Route 1: Playwright

The packaged probe attaches `pageerror` and console listeners before navigation, then records the common facts and a full-page screenshot.

```sh
node scripts/playwright-probe.mjs \
  --target https://candidate.example \
  --run ./evidence/run-001
```

For authenticated observation, pass a Playwright storage-state file without printing it:

```sh
node scripts/playwright-probe.mjs \
  --target https://candidate.example \
  --run ./evidence/run-001 \
  --state /protected/path/state.json
```

Only after action authorization, name the exact safe selector and enable it deliberately:

```sh
node scripts/playwright-probe.mjs \
  --target http://127.0.0.1:3000 \
  --run ./evidence/run-001 \
  --allow-action \
  --primary-selector '#preview'
```

Use Playwright for deterministic assertions, initial-load exception capture, viewport sweeps, keyboard sequences, persistence readback, and clock/scheduler driving when the application exposes a test seam.

## Route 2: agent-browser

The packaged probe lists live sessions, creates a separate named session, navigates headlessly, takes a fresh snapshot, reads facts, captures a screenshot, and closes only its own session.

```sh
node scripts/agent-browser-probe.mjs \
  --target https://candidate.example \
  --run ./evidence/run-001
```

For authenticated observation, pass a protected state file. Keep it mode `0600`, never print its contents, and prove reuse in a separate state-only session.

For manual route exploration:

1. Run `agent-browser session list` and do not close an unrelated authenticated session.
2. Open the target in a uniquely named headless session.
3. After every navigation, run `snapshot -i` before using an `@eN` reference.
4. Capture before state, act, take a new snapshot, and read the after state. `Done` is not proof that the action landed.
5. Capture `errors`, `console`, and a screenshot at the broken state.
6. For interactive findings, retry once before collecting a paced reproduction video.

The route queries errors after load, so it can miss a synchronous exception. Carry that limitation into the result and cross-check Playwright.

## Route 3: Browserbase ui-test

Invoke the installed `$ui-test` skill; do not substitute a guessed `browse` command sequence for its current documentation. For localhost, use a clean local `browse` session. For deployed targets, remote Browserbase mode may require an API key, context, cookie synchronization, and cost approval.

The coordinating agent must:

1. Plan three rounds: functional, adversarial, then coverage gaps.
2. Deduplicate into numbered tests with action -> expected result.
3. Execute the plan with explicit step budgets if the installed `ui-test` workflow requires sub-agents.
4. Emit `STEP_PASS`, `STEP_FAIL`, or `STEP_SKIP` markers with direct evidence.
5. Take a screenshot immediately for every failure.
6. Run deterministic accessibility, console, broken-image, form-label, keyboard, and responsive checks where relevant.
7. Stop every named `browse` session.

In addition to route-specific tests, answer the common factual probes. Save a JSON record shaped like `references/templates/ui-test-result.example.json`, then validate and record it:

```sh
node scripts/record-route-result.mjs \
  --run ./evidence/run-001 \
  --route ui-test \
  --input /path/to/ui-test-result.json
```

If the CLI, credentials, context, or Browserbase service is unavailable, record `Blocked` with the exact dependency. Do not silently replace the route with another Playwright pass.

## Route 4: dogfood

Invoke the installed `$dogfood` skill for systematic user-level exploration. It uses `agent-browser`, so describe it as a separate exploratory route rather than an independent engine.

The route must:

1. Use a fresh named session and orient with an initial annotated screenshot and snapshot.
2. Map main navigation and exercise realistic end-to-end flows.
3. Test interactive controls, forms, error states, empty states, persistence, console health, and relevant viewport widths.
4. Verify a finding once before documenting it.
5. Use a single annotated screenshot for static findings.
6. Use before/action/after screenshots and a paced video for interactive findings.
7. Append findings immediately and close only its own session.

Also answer the common factual probes and normalize the route with `references/templates/dogfood-result.example.json`:

```sh
node scripts/record-route-result.mjs \
  --run ./evidence/run-001 \
  --route dogfood \
  --input /path/to/dogfood-result.json
```

Do not count a defect twice merely because both agent-browser and dogfood observed it. Preserve both observations as corroboration and deduplicate the finding by root cause and reproduction path.
