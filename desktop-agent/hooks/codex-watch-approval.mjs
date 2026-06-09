#!/usr/bin/env node
/**
 * QuickDesk Watch - Codex PermissionRequest hook.
 *
 * Forwards Codex approval prompts to the QuickDesk agent (iPhone + Apple Watch)
 * and returns the selected allow/deny decision to Codex. If QuickDesk is not
 * reachable or nobody decides before the timeout, Codex falls back to its
 * normal approval UI.
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_URL = process.env.QUICKDESK_AGENT_URL || "http://127.0.0.1:7420";
const DATA_DIR = process.env.QUICKDESK_DATA_DIR || join(homedir(), ".quickdesk");
const WAIT_MS = Number(process.env.QUICKDESK_CODEX_APPROVAL_TIMEOUT_MS || process.env.QUICKDESK_APPROVAL_TIMEOUT_MS || 110_000);

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}

function localToken() {
  const f = join(DATA_DIR, "identity.json");
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")).localToken || null; } catch { return null; }
}

function passThrough() {
  process.exit(0);
}

function emitDecision(decision, message) {
  const behavior = decision === "allow" ? "allow" : "deny";
  const output = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: behavior === "allow"
        ? { behavior }
        : { behavior, message: message || "Denied from QuickDesk" },
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

function describe(evt) {
  const toolName = evt.tool_name || evt.toolName || "Codex";
  const input = evt.tool_input || evt.toolInput || {};
  const description = input.description || evt.description || "";

  if (toolName === "Bash") {
    return {
      title: "Run Codex command",
      summary: input.command || description,
      detail: description && description !== input.command ? description : "",
    };
  }

  if (toolName === "apply_patch") {
    return {
      title: "Apply Codex edit",
      summary: input.command || description || "Patch files",
      detail: "",
    };
  }

  const summary = input.command || input.file_path || input.url || description || stringifyShort(input);
  return {
    title: `Approve Codex ${toolName}`,
    summary,
    detail: description && description !== summary ? description : "",
  };
}

function stringifyShort(value) {
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return "";
  }
}

async function createApproval(headers, evt, d) {
  const res = await fetch(`${AGENT_URL}/approvals`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(4000),
    body: JSON.stringify({
      source: "codex",
      tool: evt.tool_name || evt.toolName || "Codex",
      cwd: evt.cwd || process.cwd(),
      title: d.title,
      summary: d.summary,
      detail: d.detail,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()).approval?.id || null;
}

async function waitForDecision(headers, approvalId) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), WAIT_MS);
  try {
    const res = await fetch(`${AGENT_URL}/approvals/${approvalId}?wait=1`, {
      headers,
      signal: ac.signal,
    });
    const approval = (await res.json()).approval;
    return approval?.decision || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const token = localToken();
  if (!token) passThrough();

  const evt = readStdin();
  if (evt.hook_event_name && evt.hook_event_name !== "PermissionRequest") passThrough();

  const toolName = evt.tool_name || evt.toolName || "";
  const filter = process.env.QUICKDESK_CODEX_APPROVE_TOOLS || process.env.QUICKDESK_APPROVE_TOOLS;
  if (filter && !filter.split(",").map((s) => s.trim()).includes(toolName)) passThrough();

  const d = describe(evt);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  let approvalId;
  try {
    approvalId = await createApproval(headers, evt, d);
  } catch {
    passThrough();
  }
  if (!approvalId) passThrough();

  const decision = await waitForDecision(headers, approvalId);
  if (decision === "allow") emitDecision("allow");
  if (decision === "deny") emitDecision("deny", "Denied from QuickDesk");
  passThrough();
}

main();
