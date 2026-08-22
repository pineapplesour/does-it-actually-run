#!/bin/sh
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SKILL_DIR=$(dirname "$SCRIPT_DIR")
MISSING=0

check_command() {
  LABEL=$1
  COMMAND=$2
  if command -v "$COMMAND" >/dev/null 2>&1; then
    printf 'Verified      %-18s %s\n' "$LABEL" "$(command -v "$COMMAND")"
  else
    printf 'Blocked       %-18s command not found: %s\n' "$LABEL" "$COMMAND"
    MISSING=$((MISSING + 1))
  fi
}

check_path() {
  LABEL=$1
  ITEM=$2
  if [ -e "$ITEM" ]; then
    printf 'Verified      %-18s %s\n' "$LABEL" "$ITEM"
  else
    printf 'Blocked       %-18s missing: %s\n' "$LABEL" "$ITEM"
    MISSING=$((MISSING + 1))
  fi
}

echo "Four-route browser verification preflight"
check_command "Node.js" node
check_command "agent-browser" agent-browser
check_command "browse CLI" browse
check_path "dogfood skill" "/Users/pc/.codex/skills/dogfood/SKILL.md"
check_path "ui-test skill" "/Users/pc/.codex/skills/ui-test/SKILL.md"
check_path "deterministic sweep" "$SCRIPT_DIR/vendor/gauntlet-verify.mjs"

if node -e "import('playwright')" >/dev/null 2>&1; then
  printf 'Verified      %-18s local npm dependency\n' "Playwright"
else
  printf 'Blocked       %-18s run npm install in %s\n' "Playwright" "$SKILL_DIR"
  MISSING=$((MISSING + 1))
fi

if [ -n "${BROWSERBASE_API_KEY:-}" ]; then
  printf 'Verified      %-18s configured (value not displayed)\n' "Browserbase key"
else
  printf 'Not exercised %-18s local ui-test remains possible; remote route needs configuration\n' "Browserbase key"
fi

if [ "$(uname -s)" = "Darwin" ]; then
  echo
  echo "Platform memory snapshot"
  sysctl vm.swapusage 2>/dev/null || true
  vm_stat 2>/dev/null | sed -n '1,8p' || true
  ps -Ao %mem,rss,comm -r 2>/dev/null | sed -n '1,10p' || true
fi

echo
echo "missing required routes or dependencies: $MISSING"
exit "$MISSING"
