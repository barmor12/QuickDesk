export interface PairedClientView {
  id: string;
  name: string;
  pairedAt: string;
  pushEnabled: boolean;
}

export interface AgentStatus {
  ok: boolean;
  agent: { id: string; name: string; os: string };
  port: number;
  host: string;
  lanUrls: string[];
  tailnetUrls: string[];
  localUrl: string;
  pairingArmed: boolean;
  autoPairing: boolean;
  pairedClients: PairedClientView[];
  push: { configured: boolean; environment: string; topic: string };
  connectedPhones: number;
  pid: number;
  version: string;
}

export interface LogEntry {
  id: string;
  taskId: string;
  taskName: string;
  status: "pending" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  output: string;
  error: string;
}

export interface Diagnostics {
  process: { uptimeSeconds: number; node: string; platform: string; arch: string; memoryMb: { rss: number } };
  tasks: { count: number; sensitive: number };
  approvals: { pending: number };
}
