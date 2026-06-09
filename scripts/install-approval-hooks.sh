#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$ROOT/desktop-agent"
REMOVE=0

if [[ "${1:-}" == "--remove" ]]; then
  REMOVE=1
fi

if [[ "$REMOVE" -eq 1 ]]; then
  node "$AGENT_DIR/scripts/install-claude-hook.mjs" --remove
  node "$AGENT_DIR/scripts/install-codex-hook.mjs" --remove
else
  node "$AGENT_DIR/scripts/install-claude-hook.mjs"
  node "$AGENT_DIR/scripts/install-codex-hook.mjs"
fi
