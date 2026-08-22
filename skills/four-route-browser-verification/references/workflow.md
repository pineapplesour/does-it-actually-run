# Reproducible workflow

## 1. Freeze the question

Record the exact target, version or commit, review candidate, baseline, requested user outcome, feature list, and test mode before opening a browser. Define success as observable effects, not implementation details. If a feature changes state over time, record the entire sequence and how the clock or scheduler will be driven.

Do not mix evidence from a previous server, branch, login identity, or target into the current run. Create a new run directory after any material candidate change.

## 2. Establish authority boundaries

Default to `read-only`. Authenticated pages may contain controls that send messages, change production settings, log out, publish, delete, buy, or otherwise affect people and systems. Observation permission is not action permission.

For an action-mode run, list every permitted action and its cleanup. External delivery to a human still requires explicit approval for the exact sender, recipient, payload class, and one-time send. See `auth-and-side-effects.md`.

## 3. Cold start and preflight

Run `scripts/preflight.sh` before starting several browsers. On constrained machines, reduce concurrency and execute routes sequentially. Start the application freshly and record its command, PID or deployment identifier, and observed URL in `run.json`. A server left warm from another branch is not evidence for the current candidate.

## 4. Deterministic sweep first

Run the vendored sweep before asking a model to judge the page. It measures 16 viewport widths by default and records:

- text intersection and clipping;
- horizontal overflow and smallest rendered text;
- WCAG ratio and APCA contrast estimates;
- document language, title, and landmarks;
- keyboard focus indicators from real Tab presses;
- uncaught errors, console errors, and failed requests captured from initial load;
- runtime third-party hosts;
- control response when not in read-only mode;
- print CSS, page count, and print-layout degradation.

The exit code is the number of findings, capped at 100. Preserve `result.json`, `measured.json`, screenshots, PDF, and `exit-status.txt`. Read `known-limitations.md` before accepting geometry, dead-control, print, or container-query results.

## 5. Cross the four routes

Run each route against the same target and version. Ask the same factual questions before route-specific exploration:

| Probe | Required evidence | Disagreement rule |
|---|---|---|
| Document title | exact string | any difference |
| Final URL | normalized URL after initial load | any difference |
| Initial uncaught errors | error list or explicit limitation | presence differs |
| Console errors | message list | presence differs |
| Visible text length | integer | difference greater than 25% |
| Visible controls | integer | any difference |
| Primary control response | before/action/after, only when authorized | Boolean differs |
| Screenshot identity | path, SHA-256, viewport, timestamp | missing evidence |

Do not resolve a disagreement by majority vote. First check target/version mismatch, authentication identity, viewport, timing, cached state, redirects, delayed rendering, and each tool's collection semantics. Repeat only after recording why the repeat is methodologically different.

## 6. Test the whole feature

For each item in `feature-inventory.md`, capture:

1. starting state;
2. user action through the actual UI;
3. immediate UI result;
4. persisted state after reload or navigation;
5. receiving-side or downstream result when applicable;
6. cleanup or rollback;
7. `Verified`, `Failed`, `Not exercised`, or `Blocked`.

Test empty, invalid, boundary, repeated, rapid, keyboard-only, mobile, error-recovery, and role-sensitive paths where relevant. Re-exercise at least one unrelated feature as a regression check.

## 7. Drive time

Do not wait for tomorrow. Inject the timestamp, advance a fake clock, call the scheduler, or seed the delayed state. Verify the sequence A -> B -> C, not merely each stage in isolation. Record the clock-driving method and every intermediate persisted state.

## 8. Look at the pixels

At minimum inspect 320, 390, 768, 1440, and 2560 widths when the page supports that range; the deterministic sweep covers more. Capture the screenshot, open it as an image, and judge hierarchy, first-three-second comprehension, sameness, balance, truncation, and visual state. Repeat `shoot -> read -> judge -> fix -> shoot` after changes.

A screenshot file existing is not evidence that anybody inspected it. Update `run.json.screenshotInspection` with the inspector and conclusion.

## 9. Reconcile and report

Run the comparator and report builder. The report's first screen must show target, version, route states, deterministic finding count, disagreement count, feature-case count, cold-start state, screenshot-inspection state, and delayed-stage state.

Use the final states literally:

- `Verified`: the claimed effect was observed through the real path with direct evidence.
- `Failed`: expected and actual results differed.
- `Not exercised`: the path was not run, including because it was out of scope.
- `Blocked`: the path was attempted but a named dependency or permission prevented completion.

Do not promote, merge, deploy, or overwrite the canonical target from this workflow. The report is a review candidate; promotion is a separate explicit decision.
