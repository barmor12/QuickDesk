import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import type { AgentStatus } from "../types";
import { api } from "../api";
import { Card, useToast } from "../ui";

export function PairingCard({ status, onChange }: { status: AgentStatus; onChange: () => void }) {
  const flash = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Encode a pairing payload the iPhone can scan: host + port + code.
  useEffect(() => {
    if (!code) {
      setQr(null);
      return;
    }
    const host = status.lanUrls[0]?.replace("http://", "").replace(`:${status.port}`, "") ?? status.host;
    const payload = JSON.stringify({ v: 1, host, port: status.port, code });
    QRCode.toDataURL(payload, { margin: 1, width: 320, color: { dark: "#0b1120", light: "#e2f8f4" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [code, status]);

  async function generate() {
    setBusy(true);
    try {
      const res = await api.newCode();
      setCode(res.code);
      flash("New pairing code created");
      onChange();
    } catch {
      flash("Could not create a code");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    flash("Code copied");
  }

  return (
    <Card title="Pairing" icon={<KeyRound className="h-4 w-4" />}>
      {code ? (
        <div className="flex flex-col items-center gap-4">
          {qr && (
            <img
              src={qr}
              alt="Pairing QR code"
              className="h-40 w-40 rounded-xl border border-white/10 bg-white/90 p-1.5 shadow-glass"
            />
          )}
          <div className="text-center">
            <div className="font-mono text-4xl font-bold tracking-[0.35em] text-slate-50">{code}</div>
            <div className="mt-1 text-xs text-slate-400">Valid for 5 minutes · enter it in the iPhone app</div>
          </div>
          <div className="flex w-full gap-2">
            <button className="btn-ghost flex-1" onClick={copy}>
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button className="btn-primary flex-1" onClick={generate} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> New code
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-3 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-teal/20 to-brand-indigo/20 text-brand-teal">
            <KeyRound className="h-7 w-7" />
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-400">
            Generate a one-time code to pair a new iPhone or Apple Watch. Nearby devices can also auto-pair
            when {status.autoPairing ? "enabled" : "you enable auto-pairing"}.
          </p>
          <button className="btn-primary w-full" onClick={generate} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Generate code
          </button>
        </div>
      )}
    </Card>
  );
}
