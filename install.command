#!/usr/bin/env bash
#
# QuickDesk — one-step installer for macOS.
# Double-click this file in Finder, or run it from a terminal.
#
set -euo pipefail
cd "$(dirname "$0")"

clear
cat <<'BANNER'
  ___        _      _   ___          _
 / _ \ _  _ (_) __ | |_|   \ ___ ___| |__
| (_) | || || |/ _|| / / |) / -_|_-<| / /
 \__\_\\_,_||_|\__||_\_\___/\___/__/|_\_\

  QuickDesk — control your Mac from your Apple Watch & iPhone
BANNER
echo
echo "This will install the QuickDesk agent on this Mac and start it automatically."
echo "It takes about a minute. You can close this window when it finishes."
echo

bash "./scripts/setup-mac.sh" "$@"

echo
echo "✅ All done. The control panel should have opened in your browser."
echo "   If not, open:  http://127.0.0.1:7420/local"
echo
read -r -p "Press Return to close this window..." _
