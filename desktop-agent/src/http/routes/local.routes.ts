import { Router } from "express";
import { requireLocal } from "../middleware.js";
import { localStatus, agentDiagnostics } from "../../services/diagnostics.service.js";
import { armNewPairingCode, resetPairedClients } from "../../services/pairing.service.js";
import { listLogs } from "../../repositories/logs.repo.js";
import { shutdown } from "../../lifecycle.js";

/**
 * Local-only control surface backing the desktop panel served at /local.
 * Every route here is guarded by requireLocal (loopback only). The panel HTML
 * itself is served separately (see http/panel.ts).
 */
export const localApiRoutes = Router();

localApiRoutes.use(requireLocal);

localApiRoutes.get("/status", (_req, res) => {
  res.json(localStatus());
});

localApiRoutes.get("/diagnostics", (_req, res) => {
  res.json({ diagnostics: agentDiagnostics() });
});

localApiRoutes.get("/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json({ logs: listLogs(limit) });
});

localApiRoutes.post("/pairing-code", (_req, res) => {
  res.json({ ok: true, code: armNewPairingCode(), expiresInSeconds: 300 });
});

localApiRoutes.delete("/pairings", (_req, res) => {
  res.json(resetPairedClients());
});

localApiRoutes.post("/restart", (_req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 150);
});

localApiRoutes.post("/shutdown", (_req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 150);
});
