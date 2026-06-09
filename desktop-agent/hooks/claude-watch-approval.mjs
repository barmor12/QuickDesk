#!/usr/bin/env node
/**
 * QuickDesk Watch — Claude Code PreToolUse hook.
 *
 * Forwards a Claude Code permission prompt to the QuickDesk agent (→ iPhone →
 * Apple Watch) AND prints a prompt to the controlling terminal (/dev/tty), then
 * blocks until you decide in EITHER place — whichever responds first wins:
 *   • tap Allow/Deny on the Apple Watch, or
 *   • press [y]=allow / [n]=deny in the terminal.
 *
 * Register in ~/.claude/settings.json (see desktop-agent/README.md), or via
 * `node scripts/install-claude-hook.mjs`.
 *
 * Failure is graceful: if the agent is unreachable it stays silent and Claude
 * falls back to its normal terminal prompt.
 */
import { readFileSync, existsSync, openSync, writeSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import tty from "node:tty";

const AGENT_URL = process.env.QUICKDESK_AGENT_URL || "http://127.0.0.1:7420";
const DATA_DIR = process.env.QUICKDESK_DATA_DIR || join(homedir(), ".quickdesk");
const WAIT_MS = Number(process.env.QUICKDESK_APPROVAL_TIMEOUT_MS || 110_000);

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}

function localToken() {
  const f = join(DATA_DIR, "identity.json");
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")).localToken || null; } catch { return null; }
}

function passThrough() { process.exit(0); }

function emitDecision(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function describe(toolName, input = {}) {
  switch (toolName) {
    case "Bash": return { title: "run a command", summary: input.command || "", detail: input.description || "" };
    case "Write": return { title: "write a file", summary: input.file_path || "", detail: "" };
    case "Edit":
    case "MultiEdit": return { title: "edit a file", summary: input.file_path || "", detail: "" };
    case "WebFetch": return { title: "fetch a URL", summary: input.url || "", detail: input.prompt || "" };
    default: return { title: toolName || "a tool", summary: "", detail: "" };
  }
}

/**
 * Show a prompt on the controlling terminal and resolve with a decision when
 * the user presses y/n. Resolves null (never) if there is no TTY. Returns a
 * cleanup() to restore the terminal if the watch wins the race.
 */
function terminalRace(d, onDecide) {
  let wfd, rfd, ttyIn;
  const cleanup = () => {
    try { if (ttyIn) { ttyIn.setRawMode(false); ttyIn.pause(); ttyIn.destroy(); } } catch {}
    try { if (wfd != null) { writeSync(wfd, "\r\n"); closeSync(wfd); wfd = null; } } catch {}
  };
  try {
    wfd = openSync("/dev/tty", "w");
    writeSync(wfd, `\r\n⌚ QuickDesk: Claude wants to ${d.title}${d.summary ? `: ${d.summary}` : ""}\r\n   Approve on your Watch, or press  [y] allow   [n] deny ... `);
    rfd = openSync("/dev/tty", "r");
    ttyIn = new tty.ReadStream(rfd);
    ttyIn.setRawMode(true);
    ttyIn.resume();
    ttyIn.on("data", (buf) => {
      const ch = buf.toString().toLowerCase();
      if (ch === "y" || ch === "\r" || ch === "\n") onDecide("allow");
      else if (ch === "n" || ch === "") onDecide("deny");
      // ignore other keys
    });
  } catch {
    // No controlling terminal (e.g. non-interactive). Watch-only.
  }
  return cleanup;
}

async function main() {
  const token = localToken();
  if (!token) passThrough();

  const evt = readStdin();
  const toolName = evt.tool_name || evt.toolName;
  const toolInput = evt.tool_input || evt.toolInput || {};
  const cwd = evt.cwd || process.cwd();

  const filter = process.env.QUICKDESK_APPROVE_TOOLS;
  if (filter && !filter.split(",").map((s) => s.trim()).includes(toolName)) passThrough();

  const d = describe(toolName, toolInput);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // 1) Create the approval (this is what pushes it to the watch).
  let approvalId;
  try {
    const res = await fetch(`${AGENT_URL}/approvals`, {
      method: "POST", headers, signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ source: "claude", tool: toolName, cwd, title: cap(d.title), summary: d.summary, detail: d.detail }),
    });
    if (!res.ok) passThrough();
    approvalId = (await res.json()).approval?.id;
  } catch { passThrough(); }
  if (!approvalId) passThrough();

  // 2) Race the Watch (long-poll) against the terminal (/dev/tty keypress).
  const ac = new AbortController();
  let settled = false;
  let cleanupTerminal = () => {};

  const result = await new Promise((resolve) => {
    const finish = (from, decision) => {
      if (settled) return;
      settled = true;
      cleanupTerminal();
      ac.abort();
      resolve({ from, decision });
    };

    // Watch path
    (async () => {
      try {
        const res = await fetch(`${AGENT_URL}/approvals/${approvalId}?wait=1`, { headers, signal: ac.signal });
        const a = (await res.json()).approval;
        if (a?.decision) finish("watch", a.decision);
      } catch { /* aborted or network */ }
    })();

    // Terminal path
    cleanupTerminal = terminalRace(d, (decision) => finish("terminal", decision));

    // Overall safety timeout -> fall back to Claude's own prompt.
    setTimeout(() => finish("timeout", "expired"), WAIT_MS);
  });

  // If the terminal decided, tell the agent so the watch dismisses too.
  if (result.from === "terminal" && (result.decision === "allow" || result.decision === "deny")) {
    try {
      await fetch(`${AGENT_URL}/approvals/${approvalId}/decision`, {
        method: "POST", headers, signal: AbortSignal.timeout(3000),
        body: JSON.stringify({ decision: result.decision }),
      });
    } catch {}
  }

  if (result.decision === "allow") emitDecision("allow", `Approved on ${result.from === "terminal" ? "terminal" : "Apple Watch"}`);
  if (result.decision === "deny") emitDecision("deny", `Denied on ${result.from === "terminal" ? "terminal" : "Apple Watch"}`);
  passThrough(); // expired/timeout -> normal Claude prompt
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

main();
