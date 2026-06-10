import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = join(__dirname, "..");
const REPO_ROOT = join(AGENT_ROOT, "..");
const OS = platform(); // 'darwin' | 'win32' | 'linux'

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

// PowerShell -EncodedCommand accepts UTF-16LE base64 — avoids all quoting issues.
function winPsEncodedCommand(psCommand) {
  const encoded = Buffer.from(psCommand, "utf16le").toString("base64");
  return `start powershell -NoExit -EncodedCommand ${encoded}`;
}

// Open a new terminal window and run a command in the given directory.
function cdAndRun(dir, cmd) {
  if (OS === "win32") {
    const psCmd = `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'; ${cmd}`;
    return winPsEncodedCommand(psCmd);
  }
  if (OS === "darwin") {
    const shellCmd = `cd ${shQuote(dir)} && ${cmd}`;
    const escaped = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escaped}"'`;
  }
  // Linux fallback
  return `x-terminal-emulator -e bash -c ${shQuote(`cd ${shQuote(dir)} && ${cmd}; exec bash`)}`;
}

// Open a new terminal window and run a command (no directory change).
function terminalRun(cmd) {
  if (OS === "win32") return winPsEncodedCommand(cmd);
  if (OS === "darwin") {
    const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escaped}"'`;
  }
  return `x-terminal-emulator -e bash -c ${shQuote(`${cmd}; exec bash`)}`;
}

// Open a file/folder with the default handler.
function openFile(filePath) {
  if (OS === "darwin") return `open ${shQuote(filePath)}`;
  if (OS === "win32") return `start "" "${filePath.replace(/"/g, '\\"')}"`;
  return `xdg-open ${shQuote(filePath)}`;
}

// Kill processes listening on common dev ports.
function freePortsCommand() {
  if (OS === "win32") {
    return `powershell -Command "3000,3001,5173,7420,8080 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"`;
  }
  return "lsof -ti tcp:3000,3001,5173,7420,8080 | xargs kill -9 2>/dev/null || true";
}

export function developerPackTasks() {
  const isMac = OS === "darwin";
  const isWin = OS === "win32";

  const tasks = [
    {
      id: "open-codex",
      name: "Open Codex",
      icon: "terminal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: cdAndRun(REPO_ROOT, "codex"), order: 1 },
      ],
    },
    {
      id: "open-claude-code",
      name: "Open Claude Code",
      icon: "curlybraces.square.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: cdAndRun(REPO_ROOT, "claude"), order: 1 },
      ],
    },

    // Xcode tasks are macOS-only (Xcode doesn't exist on Windows/Linux)
    ...(isMac
      ? [
          {
            id: "open-quickdesk-xcode",
            name: "Open QuickDesk in Xcode",
            icon: "hammer.circle.fill",
            category: "Development",
            requiresConfirmation: false,
            actions: [
              { type: "runCommand", value: openFile(join(REPO_ROOT, "ios", "QuickDesk.xcodeproj")), order: 1 },
            ],
          },
        ]
      : []),

    {
      id: "run-agent-tests",
      name: "Run Agent Tests",
      icon: "checkmark.seal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: cdAndRun(AGENT_ROOT, "npm test"), order: 1 },
      ],
    },

    // iOS/watchOS build requires Xcode — macOS only
    ...(isMac
      ? [
          {
            id: "build-ios-watch",
            name: "Build iPhone + Watch",
            icon: "iphone.and.arrow.forward",
            category: "Development",
            requiresConfirmation: false,
            actions: [
              {
                type: "runCommand",
                value: cdAndRun(
                  REPO_ROOT,
                  `xcodebuild -project ios/QuickDesk.xcodeproj -scheme QuickDesk -configuration Debug -destination 'generic/platform=iOS' build`
                ),
                order: 1,
              },
            ],
          },
        ]
      : []),

    {
      id: "open-github-repo",
      name: "Open GitHub Repo",
      icon: "globe",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openUrl", value: "https://github.com/barmor12/QuickDesk", order: 1 },
      ],
    },
    {
      id: "open-agent-panel",
      name: "Open Agent Panel",
      icon: "wave.3.right.circle.fill",
      category: "Custom",
      requiresConfirmation: false,
      actions: [
        { type: "openUrl", value: "http://127.0.0.1:7420/local", order: 1 },
      ],
    },
    {
      id: "tailscale-status",
      name: "Tailscale Status",
      icon: "network",
      category: "System",
      requiresConfirmation: false,
      actions: [
        {
          type: "runCommand",
          value: terminalRun(
            isWin
              ? "tailscale status; if (-not $?) { Write-Output 'Tailscale CLI not found' }"
              : "tailscale status || echo 'Tailscale CLI not found'"
          ),
          order: 1,
        },
      ],
    },
    {
      id: "free-dev-ports",
      name: "Free Dev Ports",
      icon: "xmark.octagon.fill",
      category: "Development",
      requiresConfirmation: true,
      actions: [
        { type: "runCommand", value: freePortsCommand(), order: 1 },
      ],
    },
    {
      id: "developer-launchpad",
      name: "Developer Launchpad",
      icon: "sparkles",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: cdAndRun(REPO_ROOT, "echo 'QuickDesk ready'"), order: 1 },
        ...(isMac
          ? [{ type: "runCommand", value: openFile(join(REPO_ROOT, "ios", "QuickDesk.xcodeproj")), order: 2 }]
          : []),
        { type: "openUrl", value: "http://127.0.0.1:7420/local", order: 3 },
        { type: "openUrl", value: "https://github.com/barmor12/QuickDesk", order: 4 },
      ],
    },
  ];

  return tasks;
}

export function mergeDeveloperPack(existingTasks) {
  const existing = Array.isArray(existingTasks) ? existingTasks : [];
  const byId = new Map(existing.map((task) => [task.id, task]));
  let added = 0;
  let updated = 0;

  for (const task of developerPackTasks()) {
    if (byId.has(task.id)) {
      byId.set(task.id, { ...byId.get(task.id), ...task });
      updated += 1;
    } else {
      byId.set(task.id, task);
      added += 1;
    }
  }

  return { tasks: [...byId.values()], added, updated };
}

export const paths = { AGENT_ROOT, REPO_ROOT };
