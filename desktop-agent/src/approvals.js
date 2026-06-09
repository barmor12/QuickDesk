import { randomUUID } from "node:crypto";

/**
 * Live approval requests (e.g. a Claude Code or Codex permission prompt
 * forwarded from a hook). Each request is held in memory with a Promise that the
 * waiting hook awaits; the phone/watch resolves it via a decision.
 */
const pending = new Map(); // id -> approval

const DEFAULT_TTL_MS = 4 * 60 * 1000;

function publicView(a) {
  return {
    id: a.id,
    source: a.source,
    title: a.title,
    summary: a.summary,
    detail: a.detail,
    tool: a.tool,
    cwd: a.cwd,
    status: a.status,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
    decision: a.decision,
  };
}

/** Create a new pending approval. `onChange` fires for live WS broadcast. */
export function createApproval(input, { ttlMs = DEFAULT_TTL_MS, onChange } = {}) {
  const id = randomUUID();
  let resolveDecision;
  const settled = new Promise((resolve) => (resolveDecision = resolve));

  const approval = {
    id,
    source: input.source || "claude",
    title: input.title || "Approval requested",
    summary: input.summary || "",
    detail: input.detail || "",
    tool: input.tool || null,
    cwd: input.cwd || null,
    status: "pending",
    decision: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    _resolve: resolveDecision,
    settled,
  };

  const timer = setTimeout(() => {
    if (approval.status === "pending") {
      approval.status = "expired";
      approval.decision = "expired";
      approval.decidedAt = new Date().toISOString();
      approval._resolve(approval);
      onChange?.({ type: "approval.expired", approval: publicView(approval) });
      // keep briefly so a polling client can read the final state
      setTimeout(() => pending.delete(id), 30_000);
    }
  }, ttlMs);
  approval._timer = timer;

  pending.set(id, approval);
  onChange?.({ type: "approval.created", approval: publicView(approval) });
  return approval;
}

export function getApproval(id) {
  return pending.get(id) || null;
}

export function listPending() {
  return [...pending.values()]
    .filter((a) => a.status === "pending")
    .map(publicView);
}

/** Resolve an approval with allow/deny. Returns the updated view or null. */
export function decideApproval(id, decision, { onChange } = {}) {
  const a = pending.get(id);
  if (!a) return null;
  if (a.status !== "pending") return publicView(a);
  if (decision !== "allow" && decision !== "deny") return null;

  clearTimeout(a._timer);
  a.status = decision === "allow" ? "allowed" : "denied";
  a.decision = decision;
  a.decidedAt = new Date().toISOString();
  a._resolve(a);
  onChange?.({ type: "approval.decided", approval: publicView(a) });
  setTimeout(() => pending.delete(id), 30_000);
  return publicView(a);
}

/** Await the final decision of an approval (used by the long-polling hook). */
export async function waitForDecision(id) {
  const a = pending.get(id);
  if (!a) return null;
  if (a.status !== "pending") return publicView(a);
  await a.settled;
  return publicView(a);
}

export { publicView };
