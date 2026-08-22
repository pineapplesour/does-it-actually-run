#!/bin/sh
set -u

if [ "$#" -lt 2 ]; then
  echo "usage: scripts/run-machine-routes.sh <url> <run-dir> [probe options]" >&2
  exit 64
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET=$1
RUN_DIR=$2
shift 2

if [ ! -f "$RUN_DIR/run.json" ]; then
  echo "run.json not found; initialize the run first" >&2
  exit 66
fi

PLAYWRIGHT_STATUS=0
AGENT_BROWSER_STATUS=0
node "$SCRIPT_DIR/playwright-probe.mjs" --target "$TARGET" --run "$RUN_DIR" "$@" || PLAYWRIGHT_STATUS=$?
node "$SCRIPT_DIR/agent-browser-probe.mjs" --target "$TARGET" --run "$RUN_DIR" "$@" || AGENT_BROWSER_STATUS=$?

echo "playwright route exit: $PLAYWRIGHT_STATUS"
echo "agent-browser route exit: $AGENT_BROWSER_STATUS"

if [ "$PLAYWRIGHT_STATUS" -ne 0 ] || [ "$AGENT_BROWSER_STATUS" -ne 0 ]; then
  exit 2
fi
