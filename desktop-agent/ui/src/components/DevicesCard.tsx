import { Bell, BellOff, Smartphone } from "lucide-react";
import type { AgentStatus } from "../types";
import { Card } from "../ui";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function DevicesCard({ status }: { status: AgentStatus }) {
  const clients = status.pairedClients;
  return (
    <Card title={`Paired devices (${clients.length})`} icon={<Smartphone className="h-4 w-4" />}>
      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
          No paired devices yet. Generate a code to add your iPhone.
        </div>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3 transition-colors duration-200 hover:bg-white/[0.05]"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-indigo/15 text-brand-violet">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-100">{c.name}</div>
                <div className="text-xs text-slate-500">Paired {when(c.pairedAt)}</div>
              </div>
              {c.pushEnabled ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300" title="Push notifications ready">
                  <Bell className="h-3.5 w-3.5" /> Push
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="No push token registered">
                  <BellOff className="h-3.5 w-3.5" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
