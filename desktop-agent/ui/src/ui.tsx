import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";

// --- Card ------------------------------------------------------------------

export function Card({
  title,
  icon,
  className = "",
  children,
  style,
}: {
  title?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`glass p-5 animate-fade-up ${className}`} style={style}>
      {title && (
        <h2 className="card-title mb-4">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

// --- Key/value row ---------------------------------------------------------

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-100">{children}</span>
    </div>
  );
}

// --- Toast -----------------------------------------------------------------

type ToastFn = (message: string) => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout((flash as unknown as { t?: number }).t);
    (flash as unknown as { t?: number }).t = window.setTimeout(() => setMsg(null), 2400);
  }, []);

  return (
    <ToastCtx.Provider value={flash}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center transition-all duration-300 ${
          msg ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {msg && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-ink-800/90 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-glass backdrop-blur-xl">
            <CheckCircle2 className="h-4 w-4 text-brand-teal" />
            {msg}
            <button
              aria-label="Dismiss"
              className="ml-1 text-slate-500 hover:text-slate-200"
              onClick={() => setMsg(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}
