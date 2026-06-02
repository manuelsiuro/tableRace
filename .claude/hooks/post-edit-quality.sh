#!/usr/bin/env bash
# PostToolUse (Write|Edit) — format-on-save + warn on lint/type problems.
# Warn-only: never blocks. Surfaces problems back to Claude as additionalContext
# so it can self-correct. See CLAUDE.md (code quality) and the project hooks plan.
set -euo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Only act on TypeScript / CSS sources under src/.
case "$file" in
  "$CLAUDE_PROJECT_DIR"/src/*.ts | "$CLAUDE_PROJECT_DIR"/src/*.css | src/*.ts | src/*.css) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

cd "$CLAUDE_PROJECT_DIR"

# Format-on-save (silent; mutates the just-edited file).
npx --no-install prettier --write "$file" >/dev/null 2>&1 || true

nl=$'\n'
problems=""

# Lint just the edited file with autofix; report whatever remains.
if [[ "$file" == *.ts ]]; then
  lint_out=$(npx --no-install eslint --fix "$file" 2>&1) || true
  [ -n "$lint_out" ] && problems+="ESLint:${nl}${lint_out}${nl}${nl}"

  # Whole-project typecheck (single-file tsc is unreliable with module resolution;
  # this repo is tiny so it is fast).
  type_out=$(npx --no-install tsc --noEmit 2>&1) || true
  [ -n "$type_out" ] && problems+="tsc --noEmit:${nl}${type_out}${nl}"
fi

if [ -n "$problems" ]; then
  jq -n --arg ctx "Code-quality check on ${file#"$CLAUDE_PROJECT_DIR"/}:${nl}${problems}" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi
exit 0
