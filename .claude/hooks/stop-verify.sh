#!/usr/bin/env bash
# Stop — verification gate. Blocks finishing while typecheck or tests fail, so a
# turn cannot end on broken code (CLAUDE.md §4: loop until verified).
set -euo pipefail

input=$(cat)

# Loop guard: if we already blocked once and Claude is responding to it, don't
# re-block — let it finish to avoid an infinite stop loop.
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR"

nl=$'\n'
failures=""

if ! type_out=$(npx --no-install tsc --noEmit 2>&1); then
  failures+="Typecheck failed:${nl}${type_out}${nl}${nl}"
fi

if ! test_out=$(npm test --silent 2>&1); then
  failures+="Tests failed:${nl}${test_out}${nl}"
fi

if [ -n "$failures" ]; then
  jq -n --arg reason "Cannot finish — verification failed:${nl}${failures}${nl}Fix these before completing (CLAUDE.md §4: loop until verified)." \
    '{decision: "block", reason: $reason}'
fi
exit 0
