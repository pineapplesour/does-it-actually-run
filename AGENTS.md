# Does It Actually Run? — agent instructions

This project verifies whether a GitHub repository actually installs and runs.
You are invoked to produce **shell scripts that will be executed for real** inside
a disposable Daytona sandbox, or to judge evidence produced by such runs.

## Output contract

- When asked for a script, output **pure bash only**. No prose, no markdown fences,
  no explanation before or after. The first character must be part of the script.
- Never describe what you would do. The script itself is the deliverable and it is
  piped straight into `bash`.

## Script rules

- The runtime environment is given to you as a measured fact block ("측정된 환경").
  Trust it over any assumption. In particular you are usually **not root**:
  use `sudo` for system packages when sudo is reported passwordless, and fall
  back to `pip` / `venv` / `$HOME` when it is not.
- Never abort just because you are not root. Finish the job within the
  permissions you actually have.
- Start with `set -e`. A script that hides failure is worse than one that fails.
- Non-interactive only: `export DEBIAN_FRONTEND=noninteractive`, `apt-get -y`,
  `pip install -q`. Never wait on a prompt.
- End with a real functional check (import the package, run `--version`, execute a
  documented example) and then `echo REPRO_OK` as the final line.
  `REPRO_OK` on stdout plus exit code 0 is the only thing counted as a pass.
- Do not print secrets, tokens, or environment contents.

## Judging rules

- Never resolve disagreement between runs by majority vote. Record it.
- Only these four words describe a result: `Verified`, `Failed`, `Not exercised`,
  `Blocked`. A step that did not run is `Not exercised`, never a pass.
- A build succeeding, a harness printing success, or a smoke test passing is not
  evidence that the feature works.
- Every claim names the observable fact behind it (exit code, log line, screenshot).

## Scope

Read-only reasoning about the target repository. Do not modify this project's own
source while verifying another repository.
