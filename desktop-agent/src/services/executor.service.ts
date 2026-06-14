import { spawn } from "node:child_process";
import { CURRENT_OS, type OsKey } from "../config.js";
import { loadIdentity } from "../repositories/identity.repo.js";
import type {
  ActionValue,
  TaskAction,
  Task,
  ActionResult,
  TaskExecutionResult,
} from "../types.js";

const OS: OsKey = CURRENT_OS;
const EXEC_TIMEOUT_MS = 60_000;

interface SystemActionDef {
  darwin: string;
  win32: string;
  linux: string;
  dangerous: boolean;
}

/** System-level actions with a portable command per platform. */
const SYSTEM_ACTIONS: Record<string, SystemActionDef> = {
  lock: {
    darwin: "pmset displaysleepnow",
    win32: "rundll32.exe user32.dll,LockWorkStation",
    linux: "loginctl lock-session",
    dangerous: false,
  },
  sleep: {
    darwin: "pmset sleepnow",
    win32: "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
    linux: "systemctl suspend",
    dangerous: false,
  },
  shutdown: {
    darwin: "osascript -e 'tell app \"System Events\" to shut down'",
    win32: "shutdown /s /t 0",
    linux: "systemctl poweroff",
    dangerous: true,
  },
  restart: {
    darwin: "osascript -e 'tell app \"System Events\" to restart'",
    win32: "shutdown /r /t 0",
    linux: "systemctl reboot",
    dangerous: true,
  },
};

/**
 * Run a single shell command, capturing stdout/stderr. Commands always come
 * from a predefined task (never free-form input from the watch), so we run
 * them through the platform shell on purpose.
 */
function runShell(command: string, { timeout = EXEC_TIMEOUT_MS } = {}): Promise<ActionResult> {
  return new Promise((resolve) => {
    const isWin = OS === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const args = isWin ? ["/c", command] : ["-c", command];

    const child = spawn(shell, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: stderr || err.message });
    });

    child.on("close", (codeNum) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, stdout, stderr: `timed out after ${timeout}ms` });
      } else {
        resolve({ ok: codeNum === 0, code: codeNum ?? undefined, stdout, stderr });
      }
    });
  });
}

/**
 * Resolve an action value to the string for the OS the agent runs on. A value
 * is either a plain string (every platform) or a per-OS object; `default` is
 * the catch-all. Returns null when no command is defined for this OS.
 */
export function resolveValue(value: ActionValue): string | null {
  if (value && typeof value === "object") {
    const picked = value[OS] ?? value.default;
    return picked == null ? null : picked;
  }
  return value;
}

function quote(value: string): string {
  // Wrap a value so spaces survive the shell. Tasks are operator-defined, so
  // this is about correctness, not untrusted-input sanitization.
  if (OS === "win32") return `"${String(value).replace(/"/g, '""')}"`;
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function openApp(value: string): Promise<ActionResult> {
  if (OS === "darwin") return runShell(`open -a ${quote(value)}`);
  if (OS === "win32") return runShell(`start "" ${quote(value)}`);
  return runShell(`${value} &`);
}

function openUrl(value: string): Promise<ActionResult> {
  if (OS === "darwin") return runShell(`open ${quote(value)}`);
  if (OS === "win32") return runShell(`start "" ${quote(value)}`);
  return runShell(`xdg-open ${quote(value)}`);
}

function runScript(value: string): Promise<ActionResult> {
  if (OS === "win32") return runShell(value); // e.g. powershell -File C:\path\x.ps1
  return runShell(`sh ${quote(value)}`);
}

function systemAction(value: string): Promise<ActionResult> {
  const def = SYSTEM_ACTIONS[value];
  if (!def) {
    return Promise.resolve({ ok: false, stderr: `unknown system action: ${value}` });
  }
  if (def.dangerous && !loadIdentity().allowDangerousActions) {
    return Promise.resolve({
      ok: false,
      stderr: `system action "${value}" is disabled. Enable allowDangerousActions in the agent identity to permit it.`,
    });
  }
  return runShell(def[OS]);
}

/** Dispatch a single action by type. */
async function runAction(action: TaskAction): Promise<ActionResult> {
  const { type } = action;
  const value = resolveValue(action.value);
  if (value == null) {
    return {
      ok: false,
      stderr: `action "${type}" has no command defined for this OS (${OS}). Add a "${OS}" entry to its value.`,
    };
  }
  switch (type) {
    case "openApp":
      return openApp(value);
    case "openUrl":
      return openUrl(value);
    case "runCommand":
      return runShell(value);
    case "runScript":
      return runScript(value);
    case "systemAction":
      return systemAction(value);
    default:
      return { ok: false, stderr: `unknown action type: ${type}` };
  }
}

/**
 * Execute all actions of a task in `order`, stopping at the first failure.
 * Returns a combined result with per-action detail.
 */
export async function executeTask(task: Task): Promise<TaskExecutionResult> {
  const actions = [...(task.actions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const results: TaskExecutionResult["results"] = [];
  const outputs: string[] = [];
  for (const action of actions) {
    const res = await runAction(action);
    results.push({ type: action.type, value: action.value, ...res });
    if (res.stdout) outputs.push(`[${action.type} ${describe(action.value)}]\n${res.stdout.trim()}`);
    if (!res.ok) {
      return {
        ok: false,
        output: outputs.join("\n\n"),
        error: `Action "${action.type} ${describe(action.value)}" failed: ${(res.stderr || "").trim()}`,
        results,
      };
    }
  }

  return { ok: true, output: outputs.join("\n\n"), error: "", results };
}

function describe(value: ActionValue): string {
  return typeof value === "string" ? value : (resolveValue(value) ?? "[no command for this OS]");
}

export const _internals = { runShell, resolveValue, SYSTEM_ACTIONS };
