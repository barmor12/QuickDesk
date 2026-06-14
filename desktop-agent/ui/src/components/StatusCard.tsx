import { Activity, Cpu, Server, Wifi } from "lucide-react";
import type { AgentStatus, Diagnostics } from "../types";
import { Card, Row } from "../ui";

function uptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function StatusCard({ status, diag }: { status: AgentStatus; diag: Diagnostics | null }) {
  return (
    <Card title="Agent status" icon={<Server className="h-4 w-4" />}>
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
        </span>
        <div>
          <div className="text-lg font-semibold text-slate-50">{status.agent.name}</div>
          <div className="text-xs text-slate-400">
            {status.agent.os} · v{status.version} · PID {status.pid}
          </div>
        </div>
      </div>

      <Row label="Listening on">
        <span className="font-mono text-brand-teal">:{status.port}</span>
      </Row>
      <Row label="Auto pairing">
        <Badge ok={status.autoPairing}>{status.autoPairing ? "Enabled" : "Disabled"}</Badge>
      </Row>
      <Row label="Push (APNs)">
        <Badge ok={status.push.configured}>
          {status.push.configured ? status.push.environment : "Not configured"}
        </Badge>
      </Row>
      <Row label="Connected phones">
        <span className="inline-flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5 text-slate-400" />
          {status.connectedPhones}
        </span>
      </Row>
      {diag && (
        <>
          <Row label="Uptime">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-slate-400" />
              {uptime(diag.process.uptimeSeconds)}
            </span>
          </Row>
          <Row label="Memory · Node">
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-slate-400" />
              {diag.process.memoryMb.rss} MB · {diag.process.node}
            </span>
          </Row>
        </>
      )}
    </Card>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
      }`}
    >
      {children}
    </span>
  );
}
