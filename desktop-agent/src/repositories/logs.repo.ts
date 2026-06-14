import { randomUUID } from "node:crypto";
import { store } from "../infra/store.js";
import type { LogEntry } from "../types.js";

const LOG_FILE = "logs.json";
const MAX_LOGS = 500;

function readAll(): LogEntry[] {
  return store.readJson<LogEntry[]>(LOG_FILE, []);
}

function writeAll(logs: LogEntry[]): void {
  store.writeJson(LOG_FILE, logs.slice(0, MAX_LOGS));
}

/** Create a pending log entry when a task starts. */
export function startLog(input: { taskId: string; taskName: string; computerId: string }): LogEntry {
  const entry: LogEntry = {
    id: randomUUID(),
    taskId: input.taskId,
    taskName: input.taskName,
    computerId: input.computerId,
    status: "pending",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    output: "",
    error: "",
  };
  const logs = readAll();
  logs.unshift(entry);
  writeAll(logs);
  return entry;
}

/** Finalize a log entry once the task succeeds or fails. */
export function finishLog(
  id: string,
  result: { status: LogEntry["status"]; output?: string; error?: string }
): LogEntry | null {
  const logs = readAll();
  const entry = logs.find((l) => l.id === id);
  if (!entry) return null;
  entry.status = result.status;
  entry.finishedAt = new Date().toISOString();
  entry.output = result.output ?? "";
  entry.error = result.error ?? "";
  writeAll(logs);
  return entry;
}

export function listLogs(limit = 50): LogEntry[] {
  return readAll().slice(0, limit);
}
