import { useState } from "react";
import { Power, RotateCw, ShieldAlert, Trash2 } from "lucide-react";
import type { AgentStatus } from "../types";
import { api } from "../api";
import { Card, useToast } from "../ui";

type Confirm = { title: string; body: string; confirmLabel: string; run: () => Promise<unknown> } | null;

export function MaintenanceCard({ status, onChange }: { status: AgentStatus; onChange: () => void }) {
  const flash = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  async function execute() {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
    } catch {
      /* the agent may drop the connection on restart/stop — that's expected */
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Card title="Maintenance" icon={<ShieldAlert className="h-4 w-4" />}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <button
          className="btn-ghost"
          onClick={() =>
            setConfirm({
              title: "Restart agent?",
              body: "The agent will briefly disconnect, then come back automatically.",
              confirmLabel: "Restart",
              run: async () => {
                await api.restart();
                flash("Restarting…");
                setTimeout(onChange, 1800);
              },
            })
          }
        >
          <RotateCw className="h-4 w-4" /> Restart
        </button>

        <button
          className="btn-warn"
          onClick={() =>
            setConfirm({
              title: "Reset all pairings?",
              body: `This removes ${status.pairedClients.length} paired device(s). They'll need to pair again.`,
              confirmLabel: "Reset pairings",
              run: async () => {
                const res = await api.resetPairings();
                flash(`Removed ${res.removed} pairing(s)`);
                onChange();
              },
            })
          }
        >
          <Trash2 className="h-4 w-4" /> Reset
        </button>

        <button
          className="btn-danger"
          onClick={() =>
            setConfirm({
              title: "Stop the agent?",
              body: "Your launch agent may restart it automatically. Tasks won't run until it's back.",
              confirmLabel: "Stop agent",
              run: async () => {
                await api.shutdown();
                flash("Stopping…");
              },
            })
          }
        >
          <Power className="h-4 w-4" /> Stop
        </button>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirm(null)}
        >
          <div
            className="glass w-full max-w-sm p-6 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-slate-50">{confirm.title}</h3>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-slate-400">{confirm.body}</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn-danger flex-1" onClick={execute} disabled={busy}>
                {busy ? "Working…" : confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
