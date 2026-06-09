import { spawn } from "node:child_process";
import { platform } from "node:os";
import { loadIdentity } from "./config.js";

const OS = platform(); // 'darwin' | 'win32' | 'linux'

const EXEC_TIMEOUT_MS = 60_000;

/**
 * Run a single shell command, capturing stdout/stderr. Commands always come
 * from a predefined task (never free-form input from the watch), so we run
 * them through the platform shell on purpose.
 */
function runShell(command, { timeout = EXEC_TIMEOUT_MS } = {}) {
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
        resolve({ ok: codeNum === 0, code: codeNum, stdout, stderr });
      }
    });
  });
}

function quote(value) {
  // Wrap a value so spaces survive the shell. Tasks are operator-defined, so
  // this is about correctness, not untrusted-input sanitization.
  if (OS === "win32") return `"${String(value).replace(/"/g, '""')}"`;
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function openApp(value) {
  if (OS === "darwin") return runShell(`open -a ${quote(value)}`);
  if (OS === "win32") return runShell(`start "" ${quote(value)}`);
  return runShell(`${value} &`);
}

function openUrl(value) {
  if (OS === "darwin") return runShell(`open ${quote(value)}`);
  if (OS === "win32") return runShell(`start "" ${quote(value)}`);
  return runShell(`xdg-open ${quote(value)}`);
}

function runScript(value) {
  if (OS === "win32") return runShell(value); // e.g. powershell -File C:\path\x.ps1
  return runShell(`sh ${quote(value)}`);
}

const SYSTEM_ACTIONS = {
  lock: { darwin: "pmset displaysleepnow", win32: "rundll32.exe user32.dll,LockWorkStation", linux: "loginctl lock-session", dangerous: false },
  sleep: { darwin: "pmset sleepnow", win32: "rundll32.exe powrprof.dll,SetSuspendState 0,1,0", linux: "systemctl suspend", dangerous: false },
  shutdown: { darwin: "osascript -e 'tell app \"System Events\" to shut down'", win32: "shutdown /s /t 0", linux: "systemctl poweroff", dangerous: true },
  restart: { darwin: "osascript -e 'tell app \"System Events\" to restart'", win32: "shutdown /r /t 0", linux: "systemctl reboot", dangerous: true },
};

function systemAction(value) {
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
  const cmd = def[OS] || def.linux;
  return runShell(cmd);
}

/** Dispatch a single action by type. */
async function runAction(action) {
  const { type, value } = action;
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
export async function executeTask(task) {
  const actions = [...(task.actions ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const results = [];
  let outputs = [];
  for (const action of actions) {
    const res = await runAction(action);
    results.push({ type: action.type, value: action.value, ...res });
    if (res.stdout) outputs.push(`[${action.type} ${action.value}]\n${res.stdout.trim()}`);
    if (!res.ok) {
      return {
        ok: false,
        output: outputs.join("\n\n"),
        error: `Action "${action.type} ${action.value}" failed: ${(res.stderr || "").trim()}`,
        results,
      };
    }
  }

  return { ok: true, output: outputs.join("\n\n"), error: "", results };
}

export const _internals = { runShell, SYSTEM_ACTIONS };
