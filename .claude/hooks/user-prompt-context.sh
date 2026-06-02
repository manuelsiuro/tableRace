#!/usr/bin/env bash
# UserPromptSubmit — inject cheap project context so responses stay grounded.
# Never blocks. Keep output short to avoid prompt noise.
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

branch=$(git branch --show-current 2>/dev/null || echo "(no git)")
changed=$(git status --porcelain 2>/dev/null | sed 's/^/  /' | head -20)
last=$(git log -1 --pretty=%s 2>/dev/null || echo "")

ctx="Project context (auto-injected):
- Branch: $branch
- Last commit: $last"
if [ -n "$changed" ]; then
  ctx+="
- Uncommitted changes:
$changed"
else
  ctx+="
- Working tree clean"
fi
ctx+="
- Library rule: 3D / WebGL / camera-and-light work -> Three.js; 2D / sprite / UI-overlay work -> PixiJS (see CLAUDE.md)."

jq -n --arg ctx "$ctx" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
