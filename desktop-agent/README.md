# QuickDesk Watch — Desktop Agent

The agent runs on your computer and executes **predefined** tasks sent from the
QuickDesk iPhone/Apple Watch app over your local network. It also forwards
**Claude Code and Codex permission prompts to your Apple Watch** so you can
approve or deny them from your wrist.

## Requirements
- Node.js 18+

## Run

```bash
cd desktop-agent
npm install
npm start
```

On start the console prints a **6-digit pairing code** and the LAN URLs:

```
  LAN URLs : http://192.168.1.20:7420
  🔑 Pairing code (valid 5 min):  486809
```

In the iPhone app, open Computers → +, select the nearby agent, and tap Pair.
The one-time code remains a manual fallback if Bonjour discovery is unavailable.

- New pairing code without restarting: `kill -HUP <pid>`.
- Change port: `QUICKDESK_PORT=8000 npm start`.
- Disable automatic local pairing: `QUICKDESK_AUTO_PAIRING=0 npm start`.
- Tests: `npm test`.

## Run continuously (launchd service)

The agent is installed as a per-user launchd service so it starts at login,
restarts on crash, and runs in the background:

```bash
# already installed at ~/Library/LaunchAgents/com.quickdesk.agent.plist
launchctl print  gui/$(id -u)/com.quickdesk.agent | grep -E 'state|pid'   # status
launchctl kickstart -k gui/$(id -u)/com.quickdesk.agent                   # restart
launchctl bootout   gui/$(id -u)/com.quickdesk.agent                      # stop
rm ~/Library/LaunchAgents/com.quickdesk.agent.plist                       # uninstall
```

Logs: `~/.quickdesk/agent.out.log` and `~/.quickdesk/agent.err.log`.

## Configuration & data

State lives in `~/.quickdesk/`:
- `identity.json` — agent id, paired clients, `localToken`, `allowDangerousActions`.
- `tasks.json` — your editable task list (seeded from `tasks.example.json` on first run).
- `logs.json` — execution history.

### Tasks

Each task has ordered actions. Action types: `openApp`, `openUrl`,
`runCommand`, `runScript`, `systemAction` (`lock`, `sleep`, `shutdown`,
`restart`). Edit `~/.quickdesk/tasks.json`, or push from the iPhone app.

### Dangerous actions
`shutdown` / `restart` are blocked unless you set `"allowDangerousActions": true`
in `identity.json`. Tasks with `"requiresConfirmation": true` require an explicit
confirmation from the phone/watch before running.

## HTTP API

| Method | Path                      | Auth | Purpose                       |
|--------|---------------------------|------|-------------------------------|
| GET    | `/health`                 | no   | Liveness + agent identity     |
| POST   | `/pair`                   | no   | One-time pairing (code)       |
| GET    | `/tasks`                  | yes  | List tasks                    |
| PUT    | `/tasks`                  | yes  | Replace task list             |
| POST   | `/tasks/execute`          | yes  | Run a task (`428` if confirm) |
| GET    | `/logs`                   | yes  | Execution history             |
| POST   | `/approvals`              | yes  | Create approval (hook)        |
| GET    | `/approvals`              | yes  | List pending approvals        |
| GET    | `/approvals/:id?wait=1`   | yes  | Long-poll for a decision      |
| POST   | `/approvals/:id/decision` | yes  | Allow/deny an approval        |
| WS     | `/ws?token=…`             | yes  | Live events to the phone      |

Auth is `Authorization: Bearer <token>` — a per-phone token from `/pair`, or the
machine-local `localToken` used by the hook.

## Claude Code / Codex → Apple Watch approvals

Claude uses a `PreToolUse` hook and Codex uses a `PermissionRequest` hook. Each
hook sends the prompt to the agent (phone + watch), blocks until you tap
Allow/Deny, then returns that decision to the originating tool. If the agent is
unreachable or the request times out, the tool prompts normally.

Install the hook into `~/.claude/settings.json` (backs up first):

```bash
node scripts/install-claude-hook.mjs           # install
node scripts/install-claude-hook.mjs --remove  # uninstall
node scripts/install-codex-hook.mjs            # install Codex hook
node scripts/install-codex-hook.mjs --remove   # uninstall Codex hook
```

Or add it manually:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|Write|Edit|MultiEdit|WebFetch",
        "hooks": [{ "type": "command",
          "command": "node /ABSOLUTE/PATH/desktop-agent/hooks/claude-watch-approval.mjs" }] }
    ]
  }
}
```

> ⚠️ Do **not** run `claude --dangerously-skip-permissions` with this feature —
> that flag bypasses all permission prompts, so nothing ever reaches your watch.

After installing the Codex hook, open `/hooks` in Codex and trust the new hook.

Env knobs for the hooks: `QUICKDESK_AGENT_URL` (default
`http://127.0.0.1:7420`), `QUICKDESK_APPROVE_TOOLS` (comma list to restrict
which tools are routed), `QUICKDESK_APPROVAL_TIMEOUT_MS` (default 110000).
Codex-specific overrides: `QUICKDESK_CODEX_APPROVE_TOOLS`,
`QUICKDESK_CODEX_APPROVAL_TIMEOUT_MS`.
