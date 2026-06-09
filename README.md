# QuickDesk

QuickDesk is a local-first iPhone and Apple Watch command center for your Mac. It pairs with a small desktop agent, lets you run useful workflows from your phone or watch, and forwards Claude Code and Codex approval prompts so you can allow or deny them without staying glued to the terminal.

## What It Does

- Run desktop workflows from iPhone and Apple Watch.
- Auto-discover the Mac agent over Bonjour/mDNS.
- Pair automatically on your local network, with a manual code fallback.
- Receive Claude Code and Codex approval prompts on iPhone and Apple Watch.
- Approve or deny permission requests from the watch.
- Manage agent status from a local Mac control panel.
- Use a polished SwiftUI interface with favorites, task search, filters, and quick launch.

## Project Structure

```text
desktop-agent/          Node.js agent that runs on your Mac
desktop-agent/hooks/    Claude Code and Codex approval hooks
ios/QuickDesk/          iPhone SwiftUI app
ios/QuickDeskWatch/     Apple Watch SwiftUI app
ios/Shared/             Models shared by iPhone and watchOS
```

## Requirements

- macOS with Node.js 18 or newer
- Xcode with iOS and watchOS SDKs
- iPhone paired with an Apple Watch
- Claude Code and/or Codex if you want approval forwarding

## Install the Desktop Agent

```bash
cd desktop-agent
npm install
npm test
npm start
```

The agent listens on port `7420` by default and advertises itself as `_quickdesk._tcp` on the local network.

Open the local control panel on the Mac:

```text
http://127.0.0.1:7420/local
```

From there you can view agent status, generate a pairing code, reset pairings, restart the agent, and see fallback LAN addresses.

## Run as a macOS LaunchAgent

Create `~/Library/LaunchAgents/com.quickdesk.agent.plist` pointing to:

```text
desktop-agent/src/index.js
```

Set `QUICKDESK_PORT=7420`, then load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.quickdesk.agent.plist
launchctl kickstart -k gui/$(id -u)/com.quickdesk.agent
```

## Install the iPhone and Apple Watch Apps

Open the Xcode project:

```bash
open ios/QuickDesk.xcodeproj
```

Build and run the `QuickDesk` scheme on your iPhone. The watch app is embedded in the iPhone app, and can also be installed directly from Xcode by selecting the `QuickDeskWatch` target and your physical Apple Watch.

If Xcode gets stuck on watchOS attach/debugging, install from Xcode once, then open QuickDesk directly from the watch app list.

## Pairing

1. Start the desktop agent.
2. Open QuickDesk on iPhone.
3. Go to `Computers`.
4. Tap `+`.
5. Select the nearby agent, or enter the Mac LAN address manually.
6. Tap `Pair`.

Auto-pairing is enabled by default on the local network. Disable it with:

```bash
QUICKDESK_AUTO_PAIRING=0 npm start
```

## Using QuickDesk Away From Home Wi-Fi

Bonjour discovery and private LAN IP addresses only work when the iPhone and Mac are on the same network. If your iPhone switches to 5G, addresses like `192.168.x.x` will not be reachable.

Recommended remote options:

### Option 1: Tailscale

1. Install Tailscale on the Mac and iPhone.
2. Keep the QuickDesk agent running on the Mac.
3. In QuickDesk on iPhone, add the Mac using its Tailscale IP or MagicDNS name.
4. Use port `7420`.

Example:

```text
100.x.y.z
macbook-name.tailnet-name.ts.net
```

### Option 2: HTTPS Tunnel

Expose the local agent through a trusted HTTPS tunnel such as Cloudflare Tunnel. Then add the full tunnel URL in QuickDesk:

```text
https://quickdesk.example.com
```

Do not expose the agent directly to the public internet without authentication and transport security.

### Notifications on 5G

The app receives approval prompts through a live WebSocket connection while the iPhone app can reach the agent. It also pulls pending approvals when the app refreshes.

For true push notifications while the iPhone app is closed, configure Apple Push Notifications on the desktop agent:

```bash
export QUICKDESK_APNS_KEY_ID="ABC123DEFG"
export QUICKDESK_APNS_TEAM_ID="YOUR_TEAM_ID"
export QUICKDESK_APNS_KEY_PATH="$HOME/AuthKey_ABC123DEFG.p8"
export QUICKDESK_APNS_TOPIC="com.barmor.quickdesk"
export QUICKDESK_APNS_ENV="sandbox" # use production for TestFlight/App Store builds
npm start
```

The iPhone app registers its APNs device token with the paired agent automatically. The agent status page shows whether APNs is configured and whether each phone has registered a push token.

Apple Push Notifications require a paid Apple Developer Program team, the Push Notifications capability for the app identifier, and a provisioning profile that includes the `aps-environment` entitlement. Personal development teams do not support APNs.

## Tasks

Tasks live in:

```text
~/.quickdesk/tasks.json
```

The first run seeds that file from:

```text
desktop-agent/tasks.example.json
```

Each task can open apps, open URLs, run commands, run scripts, or perform system actions.

Example:

```json
{
  "id": "open-claude-code",
  "name": "Open Claude Code",
  "icon": "curlybraces.square.fill",
  "category": "Development",
  "requiresConfirmation": false,
  "actions": [
    { "type": "openApp", "value": "Terminal", "order": 1 },
    { "type": "runCommand", "value": "osascript -e 'tell application \"Terminal\" to activate' -e 'tell application \"Terminal\" to do script \"claude\"'", "order": 2 }
  ]
}
```

## Claude Code Approval Forwarding

Install the Claude Code hook:

```bash
cd desktop-agent
node scripts/install-claude-hook.mjs
```

Then approve/trust the hook in Claude Code if prompted.

## Codex Approval Forwarding

Install the Codex hook:

```bash
cd desktop-agent
node scripts/install-codex-hook.mjs
```

Then open Codex hooks settings and trust the hook if prompted. Codex must be configured to ask for approvals; if approval policy is set to `never`, there will be no approval prompt to forward.

## Local Approval Test

After pairing the iPhone/watch, you can create a test approval:

```bash
TOKEN=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.quickdesk/identity.json","utf8")).localToken)')
curl -X POST http://127.0.0.1:7420/approvals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"codex","title":"QuickDesk test approval","summary":"Testing iPhone and Apple Watch notifications.","tool":"notification-test"}'
```

You should see the approval appear on the iPhone and Apple Watch.

## Security Notes

QuickDesk is designed for a trusted local network.

- Pairing creates bearer tokens for clients.
- Local hooks use a private token stored in `~/.quickdesk/identity.json`.
- Dangerous system actions are blocked unless explicitly enabled in the agent identity.
- Do not expose port `7420` to the public internet.

## Development

Run desktop-agent tests:

```bash
cd desktop-agent
npm test
```

Build the iOS/watchOS app:

```bash
xcodebuild -project ios/QuickDesk.xcodeproj -scheme QuickDesk -configuration Debug -destination 'generic/platform=iOS' build
```

## License

MIT
