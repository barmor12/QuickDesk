import { timingSafeEqual } from "node:crypto";
import { loadIdentity, saveIdentity, generateToken } from "./config.js";

/**
 * Pairing state. A pairing code is valid only for a short window and only
 * while the agent operator has "armed" pairing (printed in the console on
 * start, re-armable via SIGHUP or the --pair flag in a real deployment).
 */
let activePairing = null; // { code, expiresAt }

export function armPairing(code, ttlMs = 5 * 60 * 1000) {
  activePairing = { code, expiresAt: Date.now() + ttlMs };
}

export function isPairingArmed() {
  return activePairing && activePairing.expiresAt > Date.now();
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function pairClient({ clientName }) {
  const identity = loadIdentity();
  const token = generateToken();
  const client = {
    id: token.slice(0, 8),
    name: clientName || "iPhone",
    token,
    pairedAt: new Date().toISOString(),
  };
  identity.pairedClients.push(client);
  saveIdentity(identity);

  activePairing = null; // one-time use

  return {
    ok: true,
    token,
    agent: { id: identity.id, name: identity.name, os: identity.os },
  };
}

/**
 * Complete pairing: validate the one-time code, mint a token for the client,
 * persist it, and disarm pairing so the code can't be reused.
 */
export function completePairing({ code, clientName }) {
  if (!isPairingArmed()) {
    return { ok: false, error: "pairing_not_armed" };
  }
  if (!safeEqual(code, activePairing.code)) {
    return { ok: false, error: "invalid_code" };
  }

  const result = pairClient({ clientName });
  activePairing = null; // one-time use
  return result;
}

/** Pair a nearby client without a code. Disable with QUICKDESK_AUTO_PAIRING=0. */
export function completeAutoPairing({ clientName }) {
  if (process.env.QUICKDESK_AUTO_PAIRING === "0") {
    return { ok: false, error: "auto_pairing_disabled" };
  }
  return pairClient({ clientName });
}

export function resetPairedClients() {
  const identity = loadIdentity();
  const removed = identity.pairedClients.length;
  identity.pairedClients = [];
  saveIdentity(identity);
  return { ok: true, removed };
}

export function updateClientPushRegistration(clientId, registration) {
  const identity = loadIdentity();
  const client = identity.pairedClients.find((c) => c.id === clientId);
  if (!client) return null;

  client.push = {
    deviceToken: registration.deviceToken,
    environment: registration.environment || "sandbox",
    updatedAt: new Date().toISOString(),
  };
  saveIdentity(identity);
  return client;
}

/** Express middleware enforcing a valid bearer token from a paired client. */
export function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "missing_token" });
  }
  const token = match[1].trim();
  const identity = loadIdentity();

  // Local helpers on this machine (e.g. the Claude/Codex permission hooks) use the
  // localToken; paired phones use their own per-client token.
  if (identity.localToken && safeEqual(identity.localToken, token)) {
    req.client = { id: "local", name: "Local agent", local: true };
    return next();
  }

  const client = identity.pairedClients.find((c) => safeEqual(c.token, token));
  if (!client) {
    return res.status(401).json({ error: "invalid_token" });
  }
  req.client = client;
  next();
}
