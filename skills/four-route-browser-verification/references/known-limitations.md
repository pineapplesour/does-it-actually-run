# Known limitations and interpretation rules

## Deterministic sweep

- Wrapped inline formatting can look like text overlap when element-level bounding boxes span multiple painted lines. Confirm prose overlap with screenshots; per-line `Range.getClientRects()` is the stronger measurement.
- Decorative content intended to bleed outside a frame can trigger clipping. Check `aria-hidden`, design intent, and screenshot evidence.
- The control sweep can press sign-out. Every later control may then appear dead on a login page, and the print pass may measure the identity provider. Use `--read-only` on authenticated pages and test safe controls individually.
- An already-active control may legitimately make no DOM or network change and be reported dead. Verify its specification and user-visible state.
- The container-query detector has a known false-negative shape. A constant frame with viewport-sensitive type still needs manual or targeted arithmetic inspection.
- Contrast arithmetic can be wrong when transparency, images, gradients, blend modes, or layered backgrounds are not represented by the sampled color.
- A print PDF existing does not prove a person inspected every page.

## Playwright

- The package uses Chromium by default; this is a route, not proof of cross-browser rendering across Chromium, Firefox, and WebKit.
- A forced CSS selector can bypass some real-user constraints. Prefer role/name locators for feature tests and keep the packaged action probe narrowly scoped.
- Storage state can take the route to a different identity or tenant. Verify visible identity after navigation.

## agent-browser

- `errors` and `console` are queried after load. Synchronous initial exceptions may be absent.
- A successful command is not proof of a landed interaction. Snapshot before, act, snapshot/read after.
- Refs become stale after navigation or DOM change. Take a fresh snapshot.

## Browserbase ui-test

- Remote mode can differ from local rendering, geography, network, cookies, fonts, and feature flags.
- Browserbase credentials or contexts being unavailable blocks this route only; it does not invalidate already-collected local evidence.
- The `browse` CLI and installed skill can evolve. Read their current built-in documentation before changing command usage.

## dogfood

- dogfood uses agent-browser, so it is not transport-independent from the agent-browser route.
- Its value is systematic exploration, reproduction evidence, and user-level judgment. Do not count duplicated observations as independent defect discoveries.
- Visual judgment is necessary but weaker than deterministic evidence for measurable facts.

## Cross-route comparison

- Visible text and control counts can vary because of animation, personalization, timestamps, experiments, delayed rendering, authentication, or viewport. A disagreement is a prompt to investigate state, not automatic proof of an application defect.
- Screenshot hashes are provenance, not pixel-equivalence checks. Different engines can render different pixels legitimately.
- A four-route agreement can still share a common blind spot. Exercise the real user path and preserve receiving-side or persisted evidence.
