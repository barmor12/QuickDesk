import type { Request, Response, NextFunction } from "express";
import { loadIdentity } from "../repositories/identity.repo.js";
import { safeEqual } from "../services/pairing.service.js";

function isLoopbackRequest(req: Request): boolean {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/** Restrict an endpoint to requests originating from this machine. */
export function requireLocal(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: "local_only" });
    return;
  }
  next();
}

/** Enforce a valid bearer token from a paired client (or the local helper token). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const token = match[1]!.trim();
  const identity = loadIdentity();

  // Local helpers on this machine (e.g. the Claude/Codex permission hooks) use
  // the localToken; paired phones use their own per-client token.
  if (identity.localToken && safeEqual(identity.localToken, token)) {
    req.client = { id: "local", name: "Local agent", local: true };
    return next();
  }

  const client = identity.pairedClients.find((c) => safeEqual(c.token, token));
  if (!client) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  req.client = client;
  next();
}
