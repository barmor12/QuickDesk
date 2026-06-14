import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { listLogs } from "../../repositories/logs.repo.js";
import { agentDiagnostics } from "../../services/diagnostics.service.js";

/** Authenticated logs + diagnostics. */
export const logRoutes = Router();

logRoutes.use(requireAuth);

logRoutes.get("/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ logs: listLogs(limit) });
});

logRoutes.get("/agent/diagnostics", (_req, res) => {
  res.json({ diagnostics: agentDiagnostics() });
});
