import { connect } from "node:http2";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const APNS_TOPIC = process.env.QUICKDESK_APNS_TOPIC || "com.barmor.quickdesk";
const APNS_ENV = process.env.QUICKDESK_APNS_ENV || "sandbox";
const APNS_HOST =
  APNS_ENV === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";

let cachedJwt = null;
let cachedJwtCreatedAt = 0;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signingConfig() {
  const keyId = process.env.QUICKDESK_APNS_KEY_ID;
  const teamId = process.env.QUICKDESK_APNS_TEAM_ID;
  const keyPath = process.env.QUICKDESK_APNS_KEY_PATH;
  if (!keyId || !teamId || !keyPath) return null;
  return { keyId, teamId, keyPath };
}

export function apnsStatus() {
  const config = signingConfig();
  return {
    configured: Boolean(config),
    environment: APNS_ENV,
    topic: APNS_TOPIC,
  };
}

function providerToken() {
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

export async function sendApprovalPush(deviceToken, approval) {
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
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });

    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("response", (headers) => {
      req.statusCode = Number(headers[":status"]);
      req.apnsId = headers["apns-id"];
    });
    req.on("end", () => {
      client.close();
      const ok = req.statusCode >= 200 && req.statusCode < 300;
      resolve({ ok, statusCode: req.statusCode, apnsId: req.apnsId, body: data });
    });
    req.on("error", (error) => {
      client.close();
      resolve({ ok: false, error: error.message });
    });
    req.end(payload);
  });
}
