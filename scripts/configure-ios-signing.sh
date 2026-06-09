#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/ios/QuickDesk.xcodeproj/project.pbxproj"
WATCH_INFO="$ROOT/ios/QuickDeskWatch/Info.plist"

TEAM_ID="${1:-${QUICKDESK_TEAM_ID:-}}"
BUNDLE_ID="${2:-${QUICKDESK_BUNDLE_ID:-}}"

if [[ -z "$TEAM_ID" || -z "$BUNDLE_ID" ]]; then
  cat <<'EOF'
Usage:
  ./scripts/configure-ios-signing.sh TEAM_ID com.yourname.quickdesk

Examples:
  ./scripts/configure-ios-signing.sh ABC123DE45 com.barmor.quickdesk
  QUICKDESK_TEAM_ID=ABC123DE45 QUICKDESK_BUNDLE_ID=com.yourname.quickdesk ./scripts/configure-ios-signing.sh

Find TEAM_ID in Apple Developer account membership, or in Xcode:
Xcode -> Settings -> Accounts -> your team.
EOF
  exit 1
fi

WATCH_BUNDLE_ID="$BUNDLE_ID.watchkitapp"

cp "$PROJECT" "$PROJECT.quickdesk.bak"
cp "$WATCH_INFO" "$WATCH_INFO.quickdesk.bak"

python3 - "$PROJECT" "$TEAM_ID" "$BUNDLE_ID" "$WATCH_BUNDLE_ID" <<'PY'
from pathlib import Path
import re
import sys

project = Path(sys.argv[1])
team_id, bundle_id, watch_bundle_id = sys.argv[2:5]
text = project.read_text()
text = re.sub(r'DEVELOPMENT_TEAM = [A-Z0-9]+;', f'DEVELOPMENT_TEAM = {team_id};', text)
text = re.sub(
    r'PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9_.-]+\.watchkitapp;',
    'PRODUCT_BUNDLE_IDENTIFIER = __QUICKDESK_WATCH_BUNDLE__;',
    text,
)
text = re.sub(
    r'PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9_.-]+;',
    f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
    text,
)
text = text.replace('__QUICKDESK_WATCH_BUNDLE__', watch_bundle_id)
project.write_text(text)
PY

/usr/libexec/PlistBuddy -c "Set :WKCompanionAppBundleIdentifier $BUNDLE_ID" "$WATCH_INFO" >/dev/null

cat <<EOF
iOS signing configured.

Phone bundle: $BUNDLE_ID
Watch bundle: $WATCH_BUNDLE_ID
Team ID: $TEAM_ID

Backups:
  $PROJECT.quickdesk.bak
  $WATCH_INFO.quickdesk.bak
EOF
