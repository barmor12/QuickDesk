import { randomUUID } from "node:crypto";
import { store } from "./store.js";

const LOG_FILE = "logs.json";
const MAX_LOGS = 500;

function readAll() {
  return store.readJson(LOG_FILE, []);
}

function writeAll(logs) {
  store.writeJson(LOG_FILE, logs.slice(0, MAX_LOGS));
}

/** Create a pending log entry when a task starts. */
export function startLog({ taskId, taskName, computerId }) {
  const entry = {
    id: randomUUID(),
    taskId,
    taskName,
    computerId,
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
export function finishLog(id, { status, output, error }) {
  const logs = readAll();
  const entry = logs.find((l) => l.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.finishedAt = new Date().toISOString();
  entry.output = output ?? "";
  entry.error = error ?? "";
  writeAll(logs);
  return entry;
}

export function listLogs(limit = 50) {
  return readAll().slice(0, limit);
}
