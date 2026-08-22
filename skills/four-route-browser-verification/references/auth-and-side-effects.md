# Authentication and side-effect safety

## Session state

- Reuse an appropriate live session or protected storage state before attempting a new login.
- Keep saved state files local and mode `0600`.
- Never print, paste, commit, upload, or include cookie/token values in evidence.
- Save state only from the explicitly named authenticated session.
- A nonempty file is not proof. Prove reuse through a separate state-only session that reaches the intended target without another login.
- Record only state metadata needed for reproducibility: path reference, mode check, modification time, expected identity, and liveness result.

## Identity

Before an authenticated test, verify the account and tenant expected by the target. Record the observed human-readable identity, never the credential. An authentication redirect, spinner, or tenant loop can be an identity mismatch rather than an application defect.

## Read-only default

Use `--read-only` for the deterministic sweep on authenticated or production-like pages. It skips the control-press phase while retaining geometry, runtime, focus, dependency, contrast, and print checks.

Do not pass `--allow-action` to a machine probe unless the exact selector and effect have been reviewed. Do not use generic “click every control” logic on production.

## Live external effects

Sending a message, email, notification, post, ticket, form, invitation, or any API request that delivers to a human requires approval for that specific action. Before approval, show:

- sending identity;
- receiving identity;
- payload summary;
- system affected;
- expected outcome;
- cleanup or rollback;
- whether the action is reversible.

Default to a dry run that records what would have happened. A transport success code is not receiving-end verification.

## Destructive or difficult-to-reverse controls

Do not test delete, publish, deploy, purchase, reset, revoke, production mutation, or account-security controls merely because action mode is enabled. Use a sandbox or seeded fixture, or obtain explicit target-specific authority. Keep cleanup narrow and recoverable.
