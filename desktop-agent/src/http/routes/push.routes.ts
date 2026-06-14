import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { updateClientPushRegistration } from "../../services/pairing.service.js";
import { apnsStatus } from "../../services/push.service.js";

/** Register an APNs device token for the authenticated paired client. */
export const pushRoutes = Router();

pushRoutes.use(requireAuth);

pushRoutes.post("/push/register", (req, res) => {
  const deviceToken = String(req.body?.deviceToken || "").replace(/[^a-fA-F0-9]/g, "");
  if (!deviceToken) {
    return res.status(400).json({ error: "device_token_required" });
  }
  const clientId = req.client?.id;
  if (!clientId) return res.status(401).json({ error: "missing_token" });

  const client = updateClientPushRegistration(clientId, {
    deviceToken,
    environment: req.body?.environment || "sandbox",
  });
  if (!client) return res.status(404).json({ error: "client_not_found" });
  res.json({ ok: true, push: { registered: true, configured: apnsStatus().configured } });
});
