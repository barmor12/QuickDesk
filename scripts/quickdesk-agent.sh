#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.quickdesk.agent.plist"
LABEL="com.quickdesk.agent"
SERVICE="gui/$(id -u)/$LABEL"

case "${1:-status}" in
  start)
    if [[ ! -f "$PLIST" ]]; then
      echo "QuickDesk is not installed yet. Running setup..."
      "$ROOT/scripts/setup-mac.sh" --no-open
    else
      launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
      launchctl kickstart -k "$SERVICE"
    fi
    ;;
  stop)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    ;;
  restart)
    launchctl kickstart -k "$SERVICE"
    ;;
  status)
    echo "LaunchAgent:"
    launchctl print "$SERVICE" 2>/dev/null | grep -E 'state =|pid =|last exit code|program =' || {
      echo "  not running"
    }
    echo
    echo "Agent health:"
    curl --max-time 3 -fsS "http://127.0.0.1:7420/health" || true
    echo
    ;;
  logs)
    touch "$HOME/.quickdesk/agent.out.log" "$HOME/.quickdesk/agent.err.log"
    tail -n 80 -f "$HOME/.quickdesk/agent.out.log" "$HOME/.quickdesk/agent.err.log"
    ;;
  panel)
    open "http://127.0.0.1:7420/local"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $PLIST"
    echo "User data remains in ~/.quickdesk"
    ;;
  *)
    cat <<'EOF'
Usage: ./scripts/quickdesk-agent.sh <command>

Commands:
  start      Start the background agent
  stop       Stop the background agent
  restart    Restart the background agent
  status     Show launchd status and /health
  logs       Follow agent logs
  panel      Open the local control panel
  uninstall  Remove the launchd service
EOF
    exit 1
    ;;
esac
