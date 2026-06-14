import { Router } from "express";
import { VERSION, env } from "../../config.js";
import { loadIdentity } from "../../repositories/identity.repo.js";
import { completePairing, completeAutoPairing, isPairingArmed } from "../../services/pairing.service.js";
import { localAddresses, isTailscaleAddress } from "../../net/addresses.js";

/** Endpoints reachable without authentication: discovery + pairing. */
export const publicRoutes = Router();

// Liveness + identity so a phone can discover/verify the agent before pairing.
publicRoutes.get("/health", (_req, res) => {
  const identity = loadIdentity();
  const tailnetAddress = localAddresses().find(isTailscaleAddress);
  res.json({
    ok: true,
    agent: { id: identity.id, name: identity.name, os: identity.os },
    pairingArmed: isPairingArmed(),
    autoPairing: env.autoPairing,
    tailnetHost: tailnetAddress || null,
    tailnetPort: tailnetAddress ? env.port : null,
    version: VERSION,
  });
});

// One-time pairing using the 6-digit code printed in the agent console.
publicRoutes.post("/pair", (req, res) => {
  const { code, clientName } = req.body || {};
  const result = completePairing({ code, clientName });
  if (!result.ok) {
    const status = result.error === "pairing_not_armed" ? 409 : 401;
    return res.status(status).json({ error: result.error });
  }
  console.log(`✅ Paired new client: ${clientName || "iPhone"}`);
  res.json(result);
});

// Local-network convenience pairing for Bonjour-discovered agents.
publicRoutes.post("/pair/auto", (req, res) => {
  const { clientName } = req.body || {};
  console.log(`➡️  Auto-pair request from ${req.ip || "unknown"}: ${clientName || "iPhone"}`);
  const result = completeAutoPairing({ clientName });
  if (!result.ok) {
    return res.status(403).json({ error: result.error });
  }
  console.log(`✅ Auto-paired new client: ${clientName || "iPhone"}`);
  res.json(result);
});
