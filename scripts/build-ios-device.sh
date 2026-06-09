#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/ios/QuickDesk.xcodeproj"
DERIVED_DATA="${QUICKDESK_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/QuickDesk}"

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Xcode command line tools are not configured." >&2
  echo "Install Xcode, then run:" >&2
  echo "  sudo xcode-select --switch /Applications/Xcode.app" >&2
  exit 1
fi

echo "Building QuickDesk for a physical iPhone with embedded Watch app..."
xcodebuild \
  -project "$PROJECT" \
  -scheme QuickDesk \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  build

cat <<EOF

Build complete.

Install from Xcode:
  open $PROJECT

Then select the QuickDesk scheme, your iPhone destination, and Run.
Xcode installs the embedded Apple Watch app automatically when the watch is paired.

Advanced direct install:
  xcrun devicectl list devices
  xcrun devicectl device install app --device DEVICE_ID "$DERIVED_DATA/Build/Products/Debug-iphoneos/QuickDesk.app"
EOF
