import { Router } from "express";
import { requireAuth } from "../middleware.js";
import {
  createApproval,
  getApproval,
  listPending,
  decideApproval,
  waitForDecision,
  publicView,
} from "../../services/approvals.service.js";
import { sendPushesForApproval } from "../../services/push.service.js";
import { hub } from "../../realtime/hub.js";

/**
 * Approvals: Claude/Codex permission prompts forwarded from a local hook, then
 * pushed live to paired phones/watches for an allow/deny decision.
 */
export const approvalRoutes = Router();

approvalRoutes.use(requireAuth);

// Created by the local hook. Broadcast over WS + APNs to paired devices.
approvalRoutes.post("/approvals", (req, res) => {
  const { title, summary, detail, tool, cwd, source } = req.body || {};
  const approval = createApproval({ title, summary, detail, tool, cwd, source }, { onChange: hub.broadcast });
  sendPushesForApproval(publicView(approval));
  res.status(201).json({ approval: publicView(approval) });
});

approvalRoutes.get("/approvals", (_req, res) => {
  res.json({ approvals: listPending() });
});

// Poll a single approval. With ?wait=1 the request long-polls until decided
// (used by the hook so it blocks Claude until you tap on the watch).
approvalRoutes.get("/approvals/:id", async (req, res) => {
  const existing = getApproval(req.params.id);
  if (!existing) return res.status(404).json({ error: "approval_not_found" });
  if (req.query.wait === "1") {
    const decided = await waitForDecision(req.params.id);
    return res.json({ approval: decided });
  }
  res.json({ approval: publicView(existing) });
});

// The phone/watch sends the user's decision here.
approvalRoutes.post("/approvals/:id/decision", (req, res) => {
  const { decision } = req.body || {};
  const updated = decideApproval(req.params.id, decision, { onChange: hub.broadcast });
  if (!updated) return res.status(404).json({ error: "approval_not_found_or_settled" });
  res.json({ approval: updated });
});
