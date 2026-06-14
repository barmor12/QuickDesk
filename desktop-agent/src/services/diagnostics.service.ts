import { cpus, freemem, totalmem } from "node:os";
import { env, VERSION } from "../config.js";
import { loadIdentity } from "../repositories/identity.repo.js";
import { loadTasks } from "../repositories/tasks.repo.js";
import { isPairingArmed } from "../services/pairing.service.js";
import { listPending } from "../services/approvals.service.js";
import { apnsStatus } from "../services/push.service.js";
import { paths } from "../services/developer-pack.js";
import { localAddresses, isTailscaleAddress } from "../net/addresses.js";
import { hub } from "../realtime/hub.js";

function bytesToMb(value: number): number {
  return Math.round(value / 1024 / 1024);
}

/** Compact status for the local control panel. */
export function localStatus() {
  const current = loadIdentity();
  const addresses = localAddresses();
  return {
    ok: true,
    agent: { id: current.id, name: current.name, os: current.os },
    port: env.port,
    host: env.host,
    lanUrls: addresses.map((address) => `http://${address}:${env.port}`),
    tailnetUrls: addresses.filter(isTailscaleAddress).map((address) => `http://${address}:${env.port}`),
    localUrl: `http://127.0.0.1:${env.port}/local`,
    pairingArmed: isPairingArmed(),
    autoPairing: env.autoPairing,
    pairedClients: current.pairedClients.map((client) => ({
      id: client.id,
      name: client.name,
      pairedAt: client.pairedAt,
      pushEnabled: Boolean(client.push?.deviceToken),
    })),
    push: apnsStatus(),
    connectedPhones: hub.size,
    pid: process.pid,
    version: VERSION,
  };
}

/** Full diagnostics for the authenticated /agent/diagnostics endpoint. */
export function agentDiagnostics() {
  const current = loadIdentity();
  const tasks = loadTasks();
  const pending = listPending();
  const addresses = localAddresses();
  return {
    ok: true,
    agent: { id: current.id, name: current.name, os: current.os },
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryMb: {
        rss: bytesToMb(process.memoryUsage().rss),
        heapUsed: bytesToMb(process.memoryUsage().heapUsed),
        systemFree: bytesToMb(freemem()),
        systemTotal: bytesToMb(totalmem()),
      },
      cpuCount: cpus().length,
    },
    paths,
    network: {
      port: env.port,
      host: env.host,
      addresses,
      lanUrls: addresses.map((address) => `http://${address}:${env.port}`),
      tailnetUrls: addresses.filter(isTailscaleAddress).map((address) => `http://${address}:${env.port}`),
    },
    tasks: {
      count: tasks.length,
      favorites: tasks.filter((task) => task.category === "Development").length,
      sensitive: tasks.filter((task) => task.requiresConfirmation).length,
    },
    approvals: {
      pending: pending.length,
      sources: pending.reduce<Record<string, number>>((acc, approval) => {
        const source = approval.source || "unknown";
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {}),
    },
    clients: {
      paired: current.pairedClients.length,
      connectedPhones: hub.size,
      pushReady: current.pairedClients.filter((client) => client.push?.deviceToken).length,
    },
    push: apnsStatus(),
    autoPairing: env.autoPairing,
    pairingArmed: isPairingArmed(),
    version: VERSION,
  };
}
