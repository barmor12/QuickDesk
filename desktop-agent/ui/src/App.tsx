import { Loader2, Radio, Waves, WifiOff } from "lucide-react";
import { api } from "./api";
import { usePolling } from "./hooks";
import { ToastProvider, Card } from "./ui";
import { StatusCard } from "./components/StatusCard";
import { PairingCard } from "./components/PairingCard";
import { DevicesCard } from "./components/DevicesCard";
import { ActivityCard } from "./components/ActivityCard";
import { MaintenanceCard } from "./components/MaintenanceCard";

export function App() {
  const status = usePolling(api.status, 4000);
  const diag = usePolling(api.diagnostics, 8000);
  const logs = usePolling(api.logs, 5000);

  const refreshAll = () => {
    status.refresh();
    diag.refresh();
    logs.refresh();
  };

  return (
    <ToastProvider>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Header connected={!status.error && !!status.data} />

        {status.loading && !status.data ? (
          <div className="grid place-items-center py-24 text-slate-400">
            <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand-teal" />
            Connecting to the agent…
          </div>
        ) : status.error || !status.data ? (
          <Card className="mt-8 text-center">
            <WifiOff className="mx-auto mb-3 h-8 w-8 text-rose-400" />
            <h2 className="text-lg font-semibold text-slate-100">Can't reach the agent</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              The QuickDesk agent isn't responding on this machine. Make sure it's running, then retry.
            </p>
            <button className="btn-primary mx-auto mt-5" onClick={refreshAll}>
              Retry
            </button>
          </Card>
        ) : (
          <main className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatusCard status={status.data} diag={diag.data} />
            <PairingCard status={status.data} onChange={refreshAll} />
            <DevicesCard status={status.data} />
            <ActivityCard logs={logs.data ?? []} />
            <MaintenanceCard status={status.data} onChange={refreshAll} />
            <AddressCard urls={status.data.lanUrls} tailnet={status.data.tailnetUrls} />
          </main>
        )}

        <Footer version={status.data?.version} />
      </div>
    </ToastProvider>
  );
}

function Header({ connected }: { connected: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-teal to-brand-indigo shadow-glow">
          <Waves className="h-6 w-6 text-ink-950" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">QuickDesk Agent</h1>
          <p className="text-sm text-slate-400">Pair, monitor and control from your Mac, PC, iPhone &amp; Watch.</p>
        </div>
      </div>
      <div
        className={`hidden items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium sm:inline-flex ${
          connected
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : "border-rose-400/30 bg-rose-400/10 text-rose-300"
        }`}
      >
        <Radio className="h-3.5 w-3.5" />
        {connected ? "Live" : "Offline"}
      </div>
    </header>
  );
}

function AddressCard({ urls, tailnet }: { urls: string[]; tailnet: string[] }) {
  const list = urls.length ? urls : [];
  return (
    <Card title="Manual address" icon={<Radio className="h-4 w-4" />} className="lg:col-span-2">
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No LAN address found right now.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">
            If the iPhone doesn't discover this computer automatically, enter one of these addresses manually:
          </p>
          <div className="flex flex-wrap gap-2">
            {list.map((u) => (
              <code
                key={u}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-brand-teal"
              >
                {u.replace("http://", "")}
              </code>
            ))}
            {tailnet.map((u) => (
              <code
                key={u}
                className="rounded-lg border border-brand-indigo/30 bg-brand-indigo/10 px-3 py-1.5 font-mono text-xs text-brand-violet"
                title="Tailscale address"
              >
                {u.replace("http://", "")}
              </code>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Footer({ version }: { version?: string }) {
  return (
    <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-600">
      <Waves className="h-3.5 w-3.5" />
      QuickDesk {version ? `v${version}` : ""} · local control panel
    </footer>
  );
}
