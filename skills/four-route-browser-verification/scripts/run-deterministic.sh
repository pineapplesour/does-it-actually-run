#!/bin/sh
set -u

if [ "$#" -lt 2 ]; then
  echo "usage: scripts/run-deterministic.sh <url-or-static-dir> <run-dir> [--read-only]" >&2
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

mkdir -p "$RUN_DIR/deterministic"
set +e
node "$SCRIPT_DIR/vendor/gauntlet-verify.mjs" "$TARGET" \
  --out "$RUN_DIR/deterministic" --json "$@" \
  > "$RUN_DIR/deterministic/result.json"
STATUS=$?
set -e
printf '%s\n' "$STATUS" > "$RUN_DIR/deterministic/exit-status.txt"

echo "deterministic findings: $STATUS"
echo "evidence: $RUN_DIR/deterministic"
exit "$STATUS"
