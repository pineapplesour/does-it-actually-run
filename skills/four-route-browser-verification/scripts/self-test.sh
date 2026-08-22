#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SKILL_DIR=$(dirname "$SCRIPT_DIR")
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/four-route-self-test.XXXXXX")
SERVER_PID=''

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

echo "checking JavaScript syntax"
for FILE in "$SCRIPT_DIR"/*.mjs "$SKILL_DIR/tests"/*.mjs "$SKILL_DIR/tests/fixture"/*.mjs; do
  node --check "$FILE"
done

EXPECTED_SHA=e8ceb6751693c10644ed54fb11e633052e4bde9b64f18768e25a56befe746887
ACTUAL_SHA=$(shasum -a 256 "$SCRIPT_DIR/vendor/gauntlet-verify.mjs" | awk '{print $1}')
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "vendored deterministic sweep hash mismatch" >&2
  exit 1
fi

if ! node -e "import('playwright')" >/dev/null 2>&1; then
  echo "Playwright dependency missing; run npm install in $SKILL_DIR" >&2
  exit 1
fi

node "$SKILL_DIR/tests/fixture/server.mjs" > "$TMP_DIR/server-url.txt" &
SERVER_PID=$!
COUNT=0
while [ ! -s "$TMP_DIR/server-url.txt" ] && [ "$COUNT" -lt 50 ]; do
  sleep 0.1
  COUNT=$((COUNT + 1))
done
if [ ! -s "$TMP_DIR/server-url.txt" ]; then
  echo "fixture server did not start" >&2
  exit 1
fi
TARGET=$(sed -n '1p' "$TMP_DIR/server-url.txt")
RUN_DIR="$TMP_DIR/run"

node "$SCRIPT_DIR/init-run.mjs" --target "$TARGET" --out "$RUN_DIR" --version self-test >/dev/null

set +e
"$SCRIPT_DIR/run-deterministic.sh" "$TARGET" "$RUN_DIR" --read-only >/dev/null
DETERMINISTIC_STATUS=$?
set -e
if [ "$DETERMINISTIC_STATUS" -le 0 ]; then
  echo "seeded fixture should produce deterministic findings" >&2
  exit 1
fi

if [ "${FULL_BROWSER_SELF_TEST:-0}" = "1" ]; then
  "$SCRIPT_DIR/run-machine-routes.sh" "$TARGET" "$RUN_DIR" >/dev/null
  test -s "$RUN_DIR/routes/agent-browser/full.png"
else
  node "$SCRIPT_DIR/playwright-probe.mjs" --target "$TARGET" --run "$RUN_DIR" >/dev/null
fi
node "$SKILL_DIR/tests/comparator-self-test.mjs" "$RUN_DIR"
node "$SCRIPT_DIR/build-report.mjs" --run "$RUN_DIR" >/dev/null
test -s "$RUN_DIR/report/index.html"

VALIDATOR=/Users/pc/.codex/skills/.system/skill-creator/scripts/quick_validate.py
if [ -f "$VALIDATOR" ]; then
  if python3 -c 'import yaml' >/dev/null 2>&1; then
    python3 "$VALIDATOR" "$SKILL_DIR"
  elif command -v uv >/dev/null 2>&1; then
    uv run --quiet --with pyyaml python "$VALIDATOR" "$SKILL_DIR"
  else
    echo "Not exercised: official quick validator needs PyYAML (browser and package checks passed)" >&2
  fi
fi

echo "self-test passed; deterministic findings: $DETERMINISTIC_STATUS"
