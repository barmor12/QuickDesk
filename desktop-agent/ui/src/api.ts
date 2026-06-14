import type { AgentStatus, Diagnostics, LogEntry } from "./types";

// The panel is served under /local, and its JSON API lives at the same prefix.
const BASE = "/local";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function send<T>(path: string, method: "POST" | "DELETE"): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => getJson<AgentStatus>("/status"),
  diagnostics: () => getJson<{ diagnostics: Diagnostics }>("/diagnostics").then((r) => r.diagnostics),
  logs: () => getJson<{ logs: LogEntry[] }>("/logs").then((r) => r.logs),
  newCode: () => send<{ ok: boolean; code: string; expiresInSeconds: number }>("/pairing-code", "POST"),
  resetPairings: () => send<{ ok: boolean; removed: number }>("/pairings", "DELETE"),
  restart: () => send<{ ok: boolean }>("/restart", "POST"),
  shutdown: () => send<{ ok: boolean }>("/shutdown", "POST"),
};
