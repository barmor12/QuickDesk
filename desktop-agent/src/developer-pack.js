import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = join(__dirname, "..");
const REPO_ROOT = join(AGENT_ROOT, "..");

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function terminalScript(command) {
  const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escaped}"'`;
}

export function developerPackTasks() {
  const repoRoot = shQuote(REPO_ROOT);
  const agentRoot = shQuote(AGENT_ROOT);
  return [
    {
      id: "open-codex",
      name: "Open Codex",
      icon: "terminal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openApp", value: "Terminal", order: 1 },
        { type: "runCommand", value: terminalScript(`cd ${repoRoot} && codex`), order: 2 },
      ],
    },
    {
      id: "open-claude-code",
      name: "Open Claude Code",
      icon: "curlybraces.square.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openApp", value: "Terminal", order: 1 },
        { type: "runCommand", value: terminalScript(`cd ${repoRoot} && claude`), order: 2 },
      ],
    },
    {
      id: "open-quickdesk-xcode",
      name: "Open QuickDesk in Xcode",
      icon: "hammer.circle.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: `open ${shQuote(join(REPO_ROOT, "ios", "QuickDesk.xcodeproj"))}`, order: 1 },
      ],
    },
    {
      id: "run-agent-tests",
      name: "Run Agent Tests",
      icon: "checkmark.seal.fill",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "runCommand", value: terminalScript(`cd ${agentRoot} && npm test`), order: 1 },
      ],
    },
    {
      id: "build-ios-watch",
      name: "Build iPhone + Watch",
      icon: "iphone.and.arrow.forward",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        {
          type: "runCommand",
          value: terminalScript(`cd ${repoRoot} && xcodebuild -project ios/QuickDesk.xcodeproj -scheme QuickDesk -configuration Debug -destination 'generic/platform=iOS' build`),
          order: 1,
        },
      ],
    },
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
        { type: "runCommand", value: terminalScript("tailscale status || echo 'Tailscale CLI not found'"), order: 1 },
      ],
    },
    {
      id: "free-dev-ports",
      name: "Free Dev Ports",
      icon: "xmark.octagon.fill",
      category: "Development",
      requiresConfirmation: true,
      actions: [
        { type: "runCommand", value: "lsof -ti tcp:3000,3001,5173,7420,8080 | xargs kill -9 2>/dev/null || true", order: 1 },
      ],
    },
    {
      id: "developer-launchpad",
      name: "Developer Launchpad",
      icon: "sparkles",
      category: "Development",
      requiresConfirmation: false,
      actions: [
        { type: "openApp", value: "Terminal", order: 1 },
        { type: "runCommand", value: `open ${shQuote(join(REPO_ROOT, "ios", "QuickDesk.xcodeproj"))}`, order: 2 },
        { type: "openUrl", value: "http://127.0.0.1:7420/local", order: 3 },
        { type: "openUrl", value: "https://github.com/barmor12/QuickDesk", order: 4 },
      ],
    },
  ];
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
