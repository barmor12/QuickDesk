import { connect } from "node:http2";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "../config.js";
import { loadIdentity } from "../repositories/identity.repo.js";
import type { ApprovalView } from "../types.js";

/** Apple Push Notification (APNs) delivery for approval alerts. */

const APNS_HOST =
  env.apns.environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

let cachedJwt: string | null = null;
let cachedJwtCreatedAt = 0;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

interface SigningConfig {
  keyId: string;
  teamId: string;
  keyPath: string;
}

function signingConfig(): SigningConfig | null {
  const { keyId, teamId, keyPath } = env.apns;
  if (!keyId || !teamId || !keyPath) return null;
  return { keyId, teamId, keyPath };
}

export function apnsStatus(): { configured: boolean; environment: string; topic: string } {
  return {
    configured: Boolean(signingConfig()),
    environment: env.apns.environment,
    topic: env.apns.topic,
  };
}

function providerToken(): string | null {
  const config = signingConfig();
  if (!config) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwtCreatedAt < 50 * 60) return cachedJwt;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  const key = readFileSync(config.keyPath, "utf8");
  const signature = createSign("sha256").update(signingInput).sign(key);

  cachedJwt = `${signingInput}.${base64url(signature)}`;
  cachedJwtCreatedAt = now;
  return cachedJwt;
}

export interface PushResult {
  ok: boolean;
  skipped?: boolean;
  statusCode?: number;
  apnsId?: string;
  body?: string;
  error?: string;
}

export async function sendApprovalPush(deviceToken: string, approval: ApprovalView): Promise<PushResult> {
  const jwt = providerToken();
  if (!jwt || !deviceToken) return { ok: false, skipped: true };

  const payload = JSON.stringify({
    aps: {
      alert: {
        title: approval.title || "QuickDesk approval",
        body: approval.summary || "Approval is waiting on your Mac.",
      },
      sound: "default",
      category: "QUICKDESK_APPROVAL",
    },
    approvalId: approval.id,
    source: approval.source,
  });

  return new Promise((resolve) => {
    const client = connect(APNS_HOST);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": env.apns.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });

    let data = "";
    let statusCode = 0;
    let apnsId: string | undefined;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("response", (headers) => {
      statusCode = Number(headers[":status"]);
      apnsId = headers["apns-id"] as string | undefined;
    });
    req.on("end", () => {
      client.close();
      const ok = statusCode >= 200 && statusCode < 300;
      resolve({ ok, statusCode, apnsId, body: data });
    });
    req.on("error", (error) => {
      client.close();
      resolve({ ok: false, error: error.message });
    });
    req.end(payload);
  });
}

/** Fan an approval out to every paired client that registered a device token. */
export function sendPushesForApproval(approval: ApprovalView): void {
  const current = loadIdentity();
  const pushClients = current.pairedClients.filter((c) => c.push?.deviceToken);
  for (const client of pushClients) {
    const token = client.push?.deviceToken;
    if (!token) continue;
    sendApprovalPush(token, approval).then((result) => {
      if (!result.ok && !result.skipped) {
        console.error(`[apns] push failed for ${client.name}:`, result);
      }
    });
  }
}
