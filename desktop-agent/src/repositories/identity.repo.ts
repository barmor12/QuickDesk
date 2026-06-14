import { randomUUID, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { store } from "../infra/store.js";
import { osLabel } from "../config.js";
import type { Identity } from "../types.js";

const IDENTITY_FILE = "identity.json";

/** Opaque bearer token handed to a paired client or local helper. */
export function generateToken(): string {
  return randomBytes(24).toString("hex");
}

/** A short, human-friendly pairing code shown in the agent console. */
export function generatePairingCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/**
 * The agent identity (id + os + paired clients + danger flag). Created on
 * first run and persisted; later reads backfill fields added in newer versions.
 */
export function loadIdentity(): Identity {
  let identity = store.readJson<Identity | null>(IDENTITY_FILE, null);
  if (!identity) {
    identity = {
      id: randomUUID(),
      name: hostname(),
      os: osLabel(),
      pairedClients: [],
      allowDangerousActions: false,
      localToken: generateToken(),
      createdAt: new Date().toISOString(),
    };
    store.writeJson(IDENTITY_FILE, identity);
  }
  if (!identity.localToken) {
    identity.localToken = generateToken();
    store.writeJson(IDENTITY_FILE, identity);
  }
  return identity;
}

export function saveIdentity(identity: Identity): Identity {
  store.writeJson(IDENTITY_FILE, identity);
  return identity;
}
