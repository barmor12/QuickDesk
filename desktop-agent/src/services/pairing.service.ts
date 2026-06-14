import { timingSafeEqual } from "node:crypto";
import { env } from "../config.js";
import { loadIdentity, saveIdentity, generateToken, generatePairingCode } from "../repositories/identity.repo.js";
import type { Identity, PairedClient } from "../types.js";

/**
 * Pairing state. A pairing code is valid only for a short window and only
 * while the operator has "armed" pairing (printed in the console on start,
 * re-armable via SIGHUP).
 */
interface ActivePairing {
  code: string;
  expiresAt: number;
}
let activePairing: ActivePairing | null = null;

export function armPairing(code: string, ttlMs = 5 * 60 * 1000): void {
  activePairing = { code, expiresAt: Date.now() + ttlMs };
}

export function isPairingArmed(): boolean {
  return Boolean(activePairing && activePairing.expiresAt > Date.now());
}

/** Generate a fresh pairing code, arm it, print it, and return it. */
export function armNewPairingCode(): string {
  const code = generatePairingCode();
  armPairing(code);
  console.log("\n  🔑 New pairing code (valid 5 min):  " + code + "\n");
  return code;
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface PairResult {
  ok: true;
  token: string;
  agent: { id: string; name: string; os: string };
}
export interface PairFailure {
  ok: false;
  error: string;
}

function pairClient(clientName?: string): PairResult {
  const identity = loadIdentity();
  const token = generateToken();
  const client: PairedClient = {
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
export function completePairing(input: { code?: string; clientName?: string }): PairResult | PairFailure {
  if (!isPairingArmed() || !activePairing) {
    return { ok: false, error: "pairing_not_armed" };
  }
  if (!input.code || !safeEqual(input.code, activePairing.code)) {
    return { ok: false, error: "invalid_code" };
  }
  return pairClient(input.clientName);
}

/** Pair a nearby client without a code. Disable with QUICKDESK_AUTO_PAIRING=0. */
export function completeAutoPairing(input: { clientName?: string }): PairResult | PairFailure {
  if (!env.autoPairing) {
    return { ok: false, error: "auto_pairing_disabled" };
  }
  return pairClient(input.clientName);
}

export function resetPairedClients(): { ok: true; removed: number } {
  const identity = loadIdentity();
  const removed = identity.pairedClients.length;
  identity.pairedClients = [];
  saveIdentity(identity);
  return { ok: true, removed };
}

export function updateClientPushRegistration(
  clientId: string,
  registration: { deviceToken: string; environment?: string }
): PairedClient | null {
  const identity: Identity = loadIdentity();
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
