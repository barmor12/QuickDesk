#!/usr/bin/env node
import express from "express";
import cors from "cors";
import bonjourService from "bonjour-service";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";

import { loadIdentity, loadTasks, saveTasks, generatePairingCode } from "./config.js";
import {
  armPairing,
  isPairingArmed,
  completePairing,
  completeAutoPairing,
  requireAuth,
  resetPairedClients,
  updateClientPushRegistration,
} from "./auth.js";
import { executeTask } from "./executor.js";
import { startLog, finishLog, listLogs } from "./logger.js";
import {
  createApproval,
  getApproval,
  listPending,
  decideApproval,
  waitForDecision,
  publicView,
} from "./approvals.js";
import { apnsStatus, sendApprovalPush } from "./apns.js";

const { Bonjour } = bonjourService;

const PORT = Number(process.env.QUICKDESK_PORT || 7420);
const HOST = process.env.QUICKDESK_HOST || "0.0.0.0";
const AUTO_PAIRING = process.env.QUICKDESK_AUTO_PAIRING !== "0";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const identity = loadIdentity();

function isLoopbackRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function requireLocal(req, res, next) {
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ error: "local_only" });
  }
  next();
}

function generateAndArmPairingCode() {
  const code = generatePairingCode();
  armPairing(code);
  console.log("\n  🔑 New pairing code (valid 5 min):  " + code + "\n");
  return code;
}

function localStatus() {
  const current = loadIdentity();
  const addresses = localAddresses();
  return {
    ok: true,
    agent: { id: current.id, name: current.name, os: current.os },
    port: PORT,
    host: HOST,
    lanUrls: addresses.map((address) => `http://${address}:${PORT}`),
    tailnetUrls: addresses.filter(isTailscaleAddress).map((address) => `http://${address}:${PORT}`),
    localUrl: `http://127.0.0.1:${PORT}/local`,
    pairingArmed: Boolean(isPairingArmed()),
    autoPairing: AUTO_PAIRING,
    pairedClients: current.pairedClients.map((client) => ({
      id: client.id,
      name: client.name,
      pairedAt: client.pairedAt,
      pushEnabled: Boolean(client.push?.deviceToken),
    })),
    push: apnsStatus(),
    connectedPhones: wsClients.size,
    pid: process.pid,
    version: "1.0.0",
  };
}

// --- WebSocket clients (live status push to paired phones) ----------------
const wsClients = new Set();
function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// --- Public endpoints (no auth) -------------------------------------------

// Liveness + identity so a phone can discover/verify the agent before pairing.
app.get("/health", (_req, res) => {
  const tailnetAddress = localAddresses().find(isTailscaleAddress);
  res.json({
    ok: true,
    agent: { id: identity.id, name: identity.name, os: identity.os },
    pairingArmed: isPairingArmed(),
    autoPairing: AUTO_PAIRING,
    tailnetHost: tailnetAddress || null,
    tailnetPort: tailnetAddress ? PORT : null,
    version: "1.0.0",
  });
});

// One-time pairing using the 6-digit code printed in the agent console.
app.post("/pair", (req, res) => {
  const { code, clientName } = req.body || {};
  const result = completePairing({ code, clientName });
  if (!result.ok) {
    const status = result.error === "pairing_not_armed" ? 409 : 401;
    return res.status(status).json({ error: result.error });
  }
  console.log(`✅ Paired new client: ${clientName || "iPhone"}`);
  res.json(result);
});

// Local-network convenience pairing for Bonjour-discovered agents. This keeps
// the one-time code available as a manual fallback, but lets the iPhone pair
// directly after the user taps a nearby computer.
app.post("/pair/auto", (req, res) => {
  const { clientName } = req.body || {};
  const result = completeAutoPairing({ clientName });
  if (!result.ok) {
    return res.status(403).json({ error: result.error });
  }
  console.log(`✅ Auto-paired new client: ${clientName || "iPhone"}`);
  res.json(result);
});

// Small local-only control page for quick manual pairing from the Mac.
app.get("/local", requireLocal, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QuickDesk Agent</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: Canvas; color: CanvasText; }
    main { width: min(860px, calc(100vw - 40px)); margin: 40px auto; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 22px; }
    h1 { font-size: 34px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 14px; }
    p { color: color-mix(in srgb, CanvasText 65%, transparent); line-height: 1.45; margin: 0; }
    button { border: 0; border-radius: 12px; padding: 13px 15px; font-size: 15px; font-weight: 700; color: white; background: #1677ff; cursor: pointer; }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: .5; cursor: default; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .panel { padding: 18px; border-radius: 16px; background: color-mix(in srgb, CanvasText 7%, transparent); }
    .wide { grid-column: 1 / -1; }
    .status { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #30d158; }
    .facts { display: grid; gap: 10px; }
    .fact { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
    .fact:last-child { border-bottom: 0; padding-bottom: 0; }
    .label { color: color-mix(in srgb, CanvasText 58%, transparent); }
    .value { text-align: right; font-weight: 700; overflow-wrap: anywhere; }
    .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .code { margin-top: 14px; padding: 18px; border-radius: 14px; background: color-mix(in srgb, CanvasText 8%, transparent); text-align: center; }
    .digits { font-size: 46px; font-weight: 850; letter-spacing: 7px; font-variant-numeric: tabular-nums; }
    .meta { margin-top: 8px; font-size: 13px; color: color-mix(in srgb, CanvasText 58%, transparent); }
    .secondary { background: color-mix(in srgb, CanvasText 14%, transparent); color: CanvasText; }
    .danger { background: #d70015; }
    .warn { background: #b26a00; }
    .list { display: grid; gap: 8px; }
    .item { padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, CanvasText 6%, transparent); }
    .item small { display: block; color: color-mix(in srgb, CanvasText 56%, transparent); margin-top: 2px; }
    .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); padding: 10px 14px; border-radius: 999px; background: CanvasText; color: Canvas; font-weight: 700; opacity: 0; transition: opacity .18s ease; }
    .toast.show { opacity: 1; }
    @media (max-width: 720px) { .grid, .actions { grid-template-columns: 1fr; } header { display: block; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>QuickDesk Agent</h1>
        <p>Local controls for pairing, status, and agent maintenance.</p>
      </div>
      <div class="status"><span class="dot"></span><span id="state">Running</span></div>
    </header>

    <div class="grid">
      <section class="panel">
        <h2>Status</h2>
        <div class="facts" id="facts"></div>
      </section>

      <section class="panel">
        <h2>Pairing</h2>
        <div class="actions">
          <button id="generate">New code</button>
          <button class="secondary" id="refresh">Refresh</button>
        </div>
        <section class="code" hidden>
          <div class="digits" id="code"></div>
          <div class="meta">Valid for 5 minutes</div>
          <div class="actions" style="margin-top: 12px">
            <button class="secondary" id="copy">Copy</button>
          </div>
        </section>
      </section>

      <section class="panel">
        <h2>Paired devices</h2>
        <div class="list" id="clients"></div>
      </section>

      <section class="panel">
        <h2>Maintenance</h2>
        <div class="actions">
          <button class="secondary" id="restart">Restart agent</button>
          <button class="warn" id="reset">Reset pairings</button>
          <button class="danger" id="shutdown">Stop agent</button>
        </div>
      </section>

      <section class="panel wide">
        <h2>Phone address fallback</h2>
        <p id="addresses"></p>
      </section>
    </div>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    const codeEl = document.querySelector("#code");
    const panel = document.querySelector(".code");
    const facts = document.querySelector("#facts");
    const clients = document.querySelector("#clients");
    const addresses = document.querySelector("#addresses");
    const toast = document.querySelector("#toast");

    function flash(message) {
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function fact(label, value) {
      return '<div class="fact"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>';
    }

    async function loadStatus() {
      const res = await fetch("/local/status");
      const data = await res.json();
      facts.innerHTML = [
        fact("Name", data.agent.name),
        fact("Port", data.port),
        fact("Auto pairing", data.autoPairing ? "Enabled" : "Disabled"),
        fact("APNs push", data.push.configured ? "Configured (" + data.push.environment + ")" : "Not configured"),
        fact("Pairing code", data.pairingArmed ? "Active" : "Not active"),
        fact("Connected phones", data.connectedPhones),
        fact("PID", data.pid)
      ].join("");
      clients.innerHTML = data.pairedClients.length
        ? data.pairedClients.map((client) => '<div class="item"><strong>' + client.name + '</strong><small>' + client.pairedAt + ' · Push ' + (client.pushEnabled ? 'ready' : 'not registered') + '</small></div>').join("")
        : '<p>No paired devices yet.</p>';
      addresses.textContent = data.lanUrls.length
        ? "If discovery does not show up on the iPhone, enter one of these manually: " + data.lanUrls.map((url) => url.replace("http://", "")).join(" or ")
        : "No LAN address found right now.";
    }

    document.querySelector("#generate").addEventListener("click", async () => {
      const res = await fetch("/local/pairing-code", { method: "POST" });
      const data = await res.json();
      codeEl.textContent = data.code;
      panel.hidden = false;
      flash("New code created");
      loadStatus();
    });
    document.querySelector("#refresh").addEventListener("click", loadStatus);
    document.querySelector("#copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(codeEl.textContent);
      flash("Copied");
    });
    document.querySelector("#reset").addEventListener("click", async () => {
      if (!confirm("Reset all paired phones and watches?")) return;
      const res = await fetch("/local/pairings", { method: "DELETE" });
      const data = await res.json();
      flash("Removed " + data.removed + " pairing(s)");
      loadStatus();
    });
    document.querySelector("#restart").addEventListener("click", async () => {
      await fetch("/local/restart", { method: "POST" });
      flash("Restarting");
      setTimeout(loadStatus, 1600);
    });
    document.querySelector("#shutdown").addEventListener("click", async () => {
      if (!confirm("Stop the agent now? LaunchAgent may start it again automatically.")) return;
      await fetch("/local/shutdown", { method: "POST" });
      flash("Stopping");
    });
    loadStatus();
  </script>
</body>
</html>`);
});

app.get("/local/status", requireLocal, (_req, res) => {
  res.json(localStatus());
});

app.post("/local/pairing-code", requireLocal, (_req, res) => {
  res.json({ ok: true, code: generateAndArmPairingCode(), expiresInSeconds: 300 });
});

app.delete("/local/pairings", requireLocal, (_req, res) => {
  res.json(resetPairedClients());
});

app.post("/local/restart", requireLocal, (_req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 150);
});

app.post("/local/shutdown", requireLocal, (_req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 150);
});

// --- Authenticated endpoints ----------------------------------------------

app.get("/tasks", requireAuth, (_req, res) => {
  res.json({ tasks: loadTasks() });
});

// Replace the full task list (iPhone task management).
app.put("/tasks", requireAuth, (req, res) => {
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: "tasks_must_be_array" });
  }
  saveTasks(tasks);
  res.json({ tasks });
});

app.post("/tasks/execute", requireAuth, async (req, res) => {
  const { taskId, confirmed } = req.body || {};
  const task = loadTasks().find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: "task_not_found" });

  // Sensitive tasks require an explicit confirmation flag from the client.
  if (task.requiresConfirmation && confirmed !== true) {
    return res.status(428).json({ error: "confirmation_required", task: { id: task.id, name: task.name } });
  }

  const log = startLog({ taskId: task.id, taskName: task.name, computerId: identity.id });
  broadcast({ type: "execution.started", log });

  const result = await executeTask(task);
  const finished = finishLog(log.id, {
    status: result.ok ? "success" : "failed",
    output: result.output,
    error: result.error,
  });
  broadcast({ type: "execution.finished", log: finished });

  res.status(result.ok ? 200 : 500).json({ ok: result.ok, log: finished, results: result.results });
});

app.get("/logs", requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ logs: listLogs(limit) });
});

app.post("/push/register", requireAuth, (req, res) => {
  const deviceToken = String(req.body?.deviceToken || "").replace(/[^a-fA-F0-9]/g, "");
  if (!deviceToken) {
    return res.status(400).json({ error: "device_token_required" });
  }
  const client = updateClientPushRegistration(req.client.id, {
    deviceToken,
    environment: req.body?.environment || "sandbox",
  });
  if (!client) return res.status(404).json({ error: "client_not_found" });
  res.json({ ok: true, push: { registered: true, configured: apnsStatus().configured } });
});

// --- Approvals (Claude/Codex permission prompts forwarded to the watch) ----

// Created by a local helper (the Claude PreToolUse hook). Pushed live to
// paired phones/watches over WebSocket.
app.post("/approvals", requireAuth, (req, res) => {
  const { title, summary, detail, tool, cwd, source } = req.body || {};
  const approval = createApproval(
    { title, summary, detail, tool, cwd, source },
    { onChange: broadcast }
  );
  sendPushesForApproval(publicView(approval));
  res.status(201).json({ approval: publicView(approval) });
});

app.get("/approvals", requireAuth, (_req, res) => {
  res.json({ approvals: listPending() });
});

// Poll a single approval. With ?wait=1 the request long-polls until decided
// (used by the hook so it blocks Claude until you tap on the watch).
app.get("/approvals/:id", requireAuth, async (req, res) => {
  const existing = getApproval(req.params.id);
  if (!existing) return res.status(404).json({ error: "approval_not_found" });
  if (req.query.wait === "1") {
    const decided = await waitForDecision(req.params.id);
    return res.json({ approval: decided });
  }
  res.json({ approval: publicView(existing) });
});

// The phone/watch sends the user's decision here.
app.post("/approvals/:id/decision", requireAuth, (req, res) => {
  const { decision } = req.body || {};
  const updated = decideApproval(req.params.id, decision, { onChange: broadcast });
  if (!updated) return res.status(404).json({ error: "approval_not_found_or_settled" });
  res.json({ approval: updated });
});

// --- HTTP + WS server ------------------------------------------------------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  // Authenticate the WS upgrade via ?token= since browsers/clients can't set
  // arbitrary headers on the upgrade easily.
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  // Reload identity so clients paired after startup are recognized (the
  // top-level `identity` snapshot does not include later pairings).
  const current = loadIdentity();
  const ok =
    token &&
    (current.localToken === token ||
      current.pairedClients.some((c) => c.token === token));
  if (!ok) {
    ws.close(4001, "unauthorized");
    return;
  }
  ws.id = randomUUID();
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

function localAddresses() {
  const out = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function isTailscaleAddress(address) {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function sendPushesForApproval(approval) {
  const current = loadIdentity();
  const pushClients = current.pairedClients.filter((client) => client.push?.deviceToken);
  for (const client of pushClients) {
    sendApprovalPush(client.push.deviceToken, approval).then((result) => {
      if (!result.ok && !result.skipped) {
        console.error(`[apns] push failed for ${client.name}:`, result);
      }
    });
  }
}

server.listen(PORT, HOST, () => {
  const code = generatePairingCode();
  armPairing(code);

  console.log("\n┌───────────────────────────────────────────────┐");
  console.log("│            QuickDesk Watch — Agent            │");
  console.log("└───────────────────────────────────────────────┘");
  console.log(`  Computer : ${identity.name} (${identity.os})`);
  console.log(`  Agent ID : ${identity.id}`);
  console.log(`  Listening: http://${HOST}:${PORT}`);
  const addrs = localAddresses();
  if (addrs.length) {
    console.log(`  LAN URLs : ${addrs.map((a) => `http://${a}:${PORT}`).join("  ")}`);
  }
  console.log(`  Dangerous actions: ${identity.allowDangerousActions ? "ENABLED" : "disabled"}`);
  console.log(`  Auto pairing: ${AUTO_PAIRING ? "ENABLED" : "disabled"}`);
  console.log("\n  🔑 Pairing code (valid 5 min):  " + code + "\n");
  console.log("  Enter this code in the QuickDesk iPhone app to pair.\n");

  // Advertise over Bonjour/mDNS so the app finds this agent automatically —
  // no IP typing, and it keeps working when the network/IP changes.
  try {
    bonjour = new Bonjour();
    const tailnetAddress = localAddresses().find(isTailscaleAddress);
    bonjour.publish({
      name: `QuickDesk ${identity.name}`.slice(0, 63),
      type: "quickdesk", // -> _quickdesk._tcp
      port: PORT,
      txt: {
        id: identity.id,
        name: identity.name,
        os: identity.os,
        v: "1.0.0",
        autoPairing: AUTO_PAIRING ? "1" : "0",
        tailnetHost: tailnetAddress || "",
        tailnetPort: tailnetAddress ? String(PORT) : "",
      },
    });
    console.log("  📡 Advertising on the local network (Bonjour: _quickdesk._tcp)\n");
  } catch (err) {
    console.error("  (Bonjour advertising unavailable:", err.message + ")");
  }
});

let bonjour;
function shutdown() {
  try { bonjour?.unpublishAll(() => bonjour?.destroy()); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Allow re-arming a fresh pairing code without restarting (kill -HUP <pid>).
process.on("SIGHUP", () => {
  generateAndArmPairingCode();
});

export { app, server };
