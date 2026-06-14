import { randomUUID } from "node:crypto";
import type {
  ApprovalInput,
  ApprovalView,
  ApprovalStatus,
  ApprovalDecision,
  RealtimeEvent,
} from "../types.js";

/**
 * Live approval requests (e.g. a Claude Code or Codex permission prompt
 * forwarded from a hook). Each is held in memory with a Promise the waiting
 * hook awaits; the phone/watch resolves it with a decision.
 */
interface Approval {
  id: string;
  source: string;
  title: string;
  summary: string;
  detail: string;
  tool: string | null;
  cwd: string | null;
  status: ApprovalStatus;
  decision: ApprovalDecision;
  createdAt: string;
  decidedAt: string | null;
  resolve: (a: Approval) => void;
  settled: Promise<Approval>;
  timer?: NodeJS.Timeout;
}

type OnChange = (event: RealtimeEvent) => void;

const pending = new Map<string, Approval>();
const DEFAULT_TTL_MS = 4 * 60 * 1000;

export function publicView(a: Approval): ApprovalView {
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
export function createApproval(
  input: ApprovalInput,
  options: { ttlMs?: number; onChange?: OnChange } = {}
): Approval {
  const { ttlMs = DEFAULT_TTL_MS, onChange } = options;
  const id = randomUUID();
  let resolveDecision!: (a: Approval) => void;
  const settled = new Promise<Approval>((resolve) => (resolveDecision = resolve));

  const approval: Approval = {
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
    resolve: resolveDecision,
    settled,
  };

  approval.timer = setTimeout(() => {
    if (approval.status === "pending") {
      approval.status = "expired";
      approval.decision = "expired";
      approval.decidedAt = new Date().toISOString();
      approval.resolve(approval);
      onChange?.({ type: "approval.expired", approval: publicView(approval) });
      setTimeout(() => pending.delete(id), 30_000);
    }
  }, ttlMs);

  pending.set(id, approval);
  onChange?.({ type: "approval.created", approval: publicView(approval) });
  return approval;
}

export function getApproval(id: string): Approval | null {
  return pending.get(id) ?? null;
}

export function listPending(): ApprovalView[] {
  return [...pending.values()].filter((a) => a.status === "pending").map(publicView);
}

/** Resolve an approval with allow/deny. Returns the updated view or null. */
export function decideApproval(
  id: string,
  decision: unknown,
  options: { onChange?: OnChange } = {}
): ApprovalView | null {
  const a = pending.get(id);
  if (!a) return null;
  if (a.status !== "pending") return publicView(a);
  if (decision !== "allow" && decision !== "deny") return null;

  if (a.timer) clearTimeout(a.timer);
  a.status = decision === "allow" ? "allowed" : "denied";
  a.decision = decision;
  a.decidedAt = new Date().toISOString();
  a.resolve(a);
  options.onChange?.({ type: "approval.decided", approval: publicView(a) });
  setTimeout(() => pending.delete(id), 30_000);
  return publicView(a);
}

/** Await the final decision of an approval (used by the long-polling hook). */
export async function waitForDecision(id: string): Promise<ApprovalView | null> {
  const a = pending.get(id);
  if (!a) return null;
  if (a.status !== "pending") return publicView(a);
  await a.settled;
  return publicView(a);
}
