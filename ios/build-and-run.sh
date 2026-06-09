#!/bin/bash
# QuickDesk Watch — build & launch the iPhone + Watch apps in simulators.
# Verified working with Xcode 26.5 / iOS 26.5 / watchOS 26.5.
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Checking Xcode…"
xcode-select -p 2>/dev/null | grep -q "Xcode.app" || {
  echo "✗ Full Xcode not selected. Install it, then:"
  echo "  sudo xcode-select --switch /Applications/Xcode.app"
  echo "  sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
  exit 1
}
xcodebuild -version | head -1

echo "▶ Ensuring XcodeGen…"
command -v xcodegen >/dev/null || brew install xcodegen

echo "▶ Ensuring simulator runtimes (downloads if missing, ~8GB each)…"
xcrun simctl list runtimes 2>/dev/null | grep -q "iOS 26"     || xcodebuild -downloadPlatform iOS
xcrun simctl list runtimes 2>/dev/null | grep -q "watchOS 26" || xcodebuild -downloadPlatform watchOS

echo "▶ Generating project…"
xcodegen generate

# IMPORTANT: do NOT pass `-sdk iphonesimulator` — it forces the embedded watch
# target onto the iOS SDK and breaks WCSessionDelegate conformance. Use only
# `-destination`, so each target builds against its own SDK.
echo "▶ Building iPhone + embedded Watch app…"
xcodebuild -project QuickDesk.xcodeproj -scheme QuickDesk -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build | tail -3

IOS_APP=$(find build/Build/Products/Debug-iphonesimulator -name "QuickDesk.app" -type d | head -1)
WATCH_APP=$(find build/Build/Products/Debug-watchsimulator -name "QuickDeskWatch.app" -type d | head -1)

echo "▶ Booting iPhone simulator…"
IDEV=$(xcrun simctl create "QuickDesk-iPhone" "iPhone 16" "com.apple.CoreSimulator.SimRuntime.iOS-26-5")
xcrun simctl boot "$IDEV"; open -a Simulator
xcrun simctl bootstatus "$IDEV"
xcrun simctl install "$IDEV" "$IOS_APP"
xcrun simctl launch "$IDEV" com.quickdesk.app

echo "▶ Booting Watch simulator…"
WDEV=$(xcrun simctl create "QuickDesk-Watch" "Apple Watch Series 10 (46mm)" "com.apple.CoreSimulator.SimRuntime.watchOS-26-5")
xcrun simctl boot "$WDEV"
xcrun simctl bootstatus "$WDEV"
xcrun simctl install "$WDEV" "$WATCH_APP"
xcrun simctl launch "$WDEV" com.quickdesk.app.watchkitapp

echo "✅ Both apps launched. In the iPhone app: Computers → + → host 127.0.0.1,"
echo "   port 7420, and the pairing code printed by the agent."
echo "   (For live Watch↔Phone sync + real-device Claude approvals, run on a"
echo "    paired iPhone+Watch from Xcode — the simulator pair also works.)"
