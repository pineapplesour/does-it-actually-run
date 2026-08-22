# Evidence contract

Each route writes `routes/<route>/facts.json`. The record is validated by `scripts/record-route-result.mjs` and compared by `scripts/compare-results.mjs`.

```json
{
  "schemaVersion": 1,
  "route": "ui-test",
  "implementation": "browse CLI / Browserbase",
  "status": "Verified",
  "target": "https://candidate.example",
  "version": "commit-or-candidate-id",
  "capturedAt": "2026-08-22T00:00:00.000Z",
  "durationMs": 120000,
  "facts": {
    "title": "Candidate",
    "finalUrl": "https://candidate.example/",
    "uncaughtErrors": [],
    "consoleErrors": [],
    "visibleTextLength": 1200,
    "visibleControlCount": 14,
    "primaryControlResponds": null,
    "screenshotPath": "routes/ui-test/full.png",
    "screenshotSha256": "hex-sha256"
  },
  "limitations": [],
  "featureCases": [
    {
      "id": "F-001",
      "name": "Primary user flow",
      "status": "Verified",
      "expected": "Persisted result appears after reload",
      "actual": "Persisted result appeared after reload",
      "evidence": "routes/ui-test/f-001-after.png",
      "steps": ["Open page", "Perform action", "Reload", "Read result"]
    }
  ],
  "error": null
}
```

All fact keys are required even when the value is `null`. `null` means not exercised or not measurable; it does not mean false or zero.

Route status describes evidence collection, not whether the application has bugs:

- `Verified`: the route ran and its evidence was observed.
- `Failed`: the route itself produced invalid or irreproducible evidence.
- `Not exercised`: no attempt was made or it was outside the authorized scope.
- `Blocked`: an attempted route could not proceed because of a named dependency or permission.

Feature-case status describes application behavior and uses the same four words. A route can therefore be `Verified` while one of its feature cases is `Failed`.

Expected run layout:

```text
run/
|-- run.json
|-- feature-inventory.md
|-- deterministic/
|   |-- result.json
|   |-- measured.json
|   |-- full.png
|   `-- print.pdf
|-- routes/
|   |-- playwright/facts.json
|   |-- agent-browser/facts.json
|   |-- ui-test/facts.json
|   `-- dogfood/facts.json
|-- comparison.json
`-- report/index.html
```
