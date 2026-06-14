import { CheckCircle2, Clock, ListChecks, XCircle } from "lucide-react";
import type { LogEntry } from "../types";
import { Card } from "../ui";

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function StatusIcon({ status }: { status: LogEntry["status"] }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-rose-400" />;
  return <Clock className="h-4 w-4 text-amber-400" />;
}

export function ActivityCard({ logs }: { logs: LogEntry[] }) {
  return (
    <Card title="Recent activity" icon={<ListChecks className="h-4 w-4" />} className="lg:col-span-2">
      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
          No tasks have run yet. Trigger one from your watch or phone.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {logs.slice(0, 8).map((log) => (
            <li key={log.id} className="flex items-center gap-3 py-2.5">
              <StatusIcon status={log.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{log.taskName}</div>
                {log.error && <div className="truncate text-xs text-rose-400/80">{log.error}</div>}
              </div>
              <time className="shrink-0 text-xs text-slate-500">{ago(log.startedAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
