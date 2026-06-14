#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$ROOT/desktop-agent"
PLIST="$HOME/Library/LaunchAgents/com.quickdesk.agent.plist"
DATA_DIR="$HOME/.quickdesk"
ENV_FILE="$DATA_DIR/agent.env"
LABEL="com.quickdesk.agent"
INSTALL_HOOKS=1
OPEN_PANEL=1

xml_escape() {
  sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' <<<"$1"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-mac.sh [--no-hooks] [--no-open]

Installs QuickDesk on this Mac:
  - installs desktop-agent npm dependencies
  - creates ~/.quickdesk/agent.env
  - installs a per-user launchd service
  - starts/restarts the agent
  - installs Claude Code and Codex approval hooks by default

Options:
  --no-hooks   Do not install Claude/Codex approval hooks.
  --no-open    Do not open the local agent panel.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-hooks) INSTALL_HOOKS=0 ;;
    --no-open) OPEN_PANEL=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "QuickDesk mobile/watch setup currently requires macOS." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install it from https://nodejs.org or with Homebrew:" >&2
  echo "  brew install node" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node.js 18+ is required. Current version: $(node -v)" >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$HOME/Library/LaunchAgents"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF'
# QuickDesk agent configuration.
# Change the port only if 7420 is already used.
QUICKDESK_PORT=7420
QUICKDESK_HOST=0.0.0.0
QUICKDESK_AUTO_PAIRING=1

# Optional APNs push notifications. Development installs use sandbox.
# QUICKDESK_APNS_KEY_ID=
# QUICKDESK_APNS_TEAM_ID=
# QUICKDESK_APNS_KEY_PATH=$HOME/AuthKey_XXXXXXXXXX.p8
# QUICKDESK_APNS_TOPIC=com.yourname.quickdesk
# QUICKDESK_APNS_ENV=sandbox
EOF
fi

echo "==> Installing desktop agent dependencies..."
npm --prefix "$AGENT_DIR" install

echo "==> Building the agent (TypeScript -> dist)..."
npm --prefix "$AGENT_DIR" run build

echo "==> Building the desktop control panel (UI)..."
npm --prefix "$AGENT_DIR/ui" install
npm --prefix "$AGENT_DIR/ui" run build

echo "==> Running tests..."
npm --prefix "$AGENT_DIR" test || echo "   (tests reported a problem — continuing install)"

chmod +x "$AGENT_DIR/scripts/run-launch-agent.sh"

RUNNER="$AGENT_DIR/scripts/run-launch-agent.sh"
RUNNER_XML="$(xml_escape "$RUNNER")"
AGENT_DIR_XML="$(xml_escape "$AGENT_DIR")"
DATA_DIR_XML="$(xml_escape "$DATA_DIR")"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RUNNER_XML</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$AGENT_DIR_XML</string>
  <key>StandardOutPath</key>
  <string>$DATA_DIR_XML/agent.out.log</string>
  <key>StandardErrorPath</key>
  <string>$DATA_DIR_XML/agent.err.log</string>
</dict>
</plist>
EOF

echo "Starting QuickDesk launch agent..."
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

if [[ "$INSTALL_HOOKS" -eq 1 ]]; then
  echo "Installing Claude Code and Codex approval hooks..."
  node "$AGENT_DIR/scripts/install-claude-hook.mjs"
  node "$AGENT_DIR/scripts/install-codex-hook.mjs"
fi

sleep 1
echo
"$ROOT/scripts/quickdesk-agent.sh" status || true

if [[ "$OPEN_PANEL" -eq 1 ]]; then
  open "http://127.0.0.1:7420/local" || true
fi

cat <<EOF

QuickDesk agent is installed.

Next:
  1. Open http://127.0.0.1:7420/local
  2. Build/install the iPhone + Watch app:
     ./scripts/configure-ios-signing.sh YOUR_TEAM_ID com.yourname.quickdesk
     ./scripts/build-ios-device.sh
  3. Pair from the iPhone app: Computers -> + -> Pair.

Useful commands:
  ./scripts/quickdesk-agent.sh status
  ./scripts/quickdesk-agent.sh restart
  ./scripts/send-test-approval.sh
EOF
