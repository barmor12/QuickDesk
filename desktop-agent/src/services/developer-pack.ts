import { join } from "node:path";
import { AGENT_ROOT, REPO_ROOT } from "../config.js";
import type { Task, PerOsValue } from "../types.js";

/**
 * A bundled set of developer-oriented tasks the user can merge into their list
 * with one tap. Commands are expressed per-OS so they work on macOS, Windows,
 * and Linux via the executor's value resolver.
 */

function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function winQuote(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

const TERMINAL_APP: PerOsValue = { darwin: "Terminal", win32: "wt", linux: "x-terminal-emulator" };

/** A per-OS value that opens a terminal window running a command. */
function terminalScript(posixCommand: string, winCommand: string = posixCommand): PerOsValue {
  const escaped = posixCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return {
    darwin: `osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escaped}"'`,
    win32: `start "" cmd /k ${winQuote(winCommand)}`,
    linux: `x-terminal-emulator -e ${shQuote(posixCommand)}`,
  };
}

export function developerPackTasks(): Task[] {
  const iosDir = join(REPO_ROOT, "ios");
  const xcodeproj = join(iosDir, "QuickDesk.xcodeproj");
  return [
    {
      id: "open-codex",
      name: "Open Codex",
      icon: "terminal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openApp", value: TERMINAL_APP, order: 1 },
        { type: "runCommand", value: terminalScript(`cd ${shQuote(REPO_ROOT)} && codex`, `cd /d ${winQuote(REPO_ROOT)} && codex`), order: 2 },
      ],
    },
    {
      id: "open-claude-code",
      name: "Open Claude Code",
      icon: "curlybraces.square.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openApp", value: TERMINAL_APP, order: 1 },
        { type: "runCommand", value: terminalScript(`cd ${shQuote(REPO_ROOT)} && claude`, `cd /d ${winQuote(REPO_ROOT)} && claude`), order: 2 },
      ],
    },
    {
      id: "open-quickdesk-xcode",
      name: "Open QuickDesk in Xcode",
      icon: "hammer.circle.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        // Xcode is macOS-only; on Windows/Linux just reveal the iOS project folder.
        { type: "runCommand", value: { darwin: `open ${shQuote(xcodeproj)}`, win32: `start "" ${winQuote(iosDir)}`, linux: `xdg-open ${shQuote(iosDir)}` }, order: 1 },
      ],
    },
    {
      id: "run-agent-tests",
      name: "Run Agent Tests",
      icon: "checkmark.seal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: terminalScript(`cd ${shQuote(AGENT_ROOT)} && npm test`, `cd /d ${winQuote(AGENT_ROOT)} && npm test`), order: 1 },
      ],
    },
    {
      id: "open-github-repo",
      name: "Open GitHub Repo",
      icon: "globe",
      category: "Development",
      requiresConfirmation: false,
      actions: [{ type: "openUrl", value: "https://github.com/barmor12/QuickDesk", order: 1 }],
    },
    {
      id: "open-agent-panel",
      name: "Open Agent Panel",
      icon: "wave.3.right.circle.fill",
      category: "Quick",
      requiresConfirmation: false,
      actions: [{ type: "openUrl", value: "http://127.0.0.1:7420/local", order: 1 }],
    },
    {
      id: "free-dev-ports",
      name: "Free Dev Ports",
      icon: "xmark.octagon.fill",
      category: "Development",
      requiresConfirmation: true,
      actions: [
        {
          type: "runCommand",
          value: {
            darwin: "lsof -ti tcp:3000,3001,5173,7420,8080 | xargs kill -9 2>/dev/null || true",
            win32: "powershell -NoProfile -Command \"Get-NetTCPConnection -LocalPort 3000,3001,5173,7420,8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }\"",
            linux: "fuser -k 3000/tcp 3001/tcp 5173/tcp 7420/tcp 8080/tcp 2>/dev/null || true",
          },
          order: 1,
        },
      ],
    },
  ];
}

export function mergeDeveloperPack(existingTasks: Task[]): { tasks: Task[]; added: number; updated: number } {
  const existing = Array.isArray(existingTasks) ? existingTasks : [];
  const byId = new Map<string, Task>(existing.map((task) => [task.id, task]));
  let added = 0;
  let updated = 0;

  for (const task of developerPackTasks()) {
    if (byId.has(task.id)) {
      byId.set(task.id, { ...byId.get(task.id)!, ...task });
      updated += 1;
    } else {
      byId.set(task.id, task);
      added += 1;
    }
  }

  return { tasks: [...byId.values()], added, updated };
}

export const paths = { AGENT_ROOT, REPO_ROOT };
