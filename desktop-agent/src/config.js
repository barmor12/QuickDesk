import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname, platform } from "node:os";
import { store } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const IDENTITY_FILE = "identity.json";
const TASKS_FILE = "tasks.json";

/**
 * The agent identity (id + os + which clients are paired + danger flag).
 * Created on first run and persisted to the data dir.
 */
export function loadIdentity() {
  let identity = store.readJson(IDENTITY_FILE, null);
  if (!identity) {
    identity = {
      id: randomUUID(),
      name: hostname(),
      os: osLabel(),
      // Clients that completed pairing. Each has its own bearer token.
      pairedClients: [],
      // Sensitive system actions (shutdown/restart) are blocked unless the
      // user explicitly opts in here.
      allowDangerousActions: false,
      // Token used by local helpers on this same machine (e.g. the Claude
      // permission hook) to talk to the agent without going through pairing.
      localToken: generateToken(),
      createdAt: new Date().toISOString(),
    };
    store.writeJson(IDENTITY_FILE, identity);
  }
  // Backfill for identities created before localToken existed.
  if (!identity.localToken) {
    identity.localToken = generateToken();
    store.writeJson(IDENTITY_FILE, identity);
  }
  return identity;
}

export function saveIdentity(identity) {
  store.writeJson(IDENTITY_FILE, identity);
  return identity;
}

export function osLabel() {
  switch (platform()) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    default:
      return "Linux";
  }
}

/**
 * Tasks come from a user-editable tasks.json. We look in the data dir first
 * (so the user can edit it without touching the install), then fall back to
 * the bundled example so the agent always boots with something.
 */
export function loadTasks() {
  const userTasks = store.readJson(TASKS_FILE, null);
  if (userTasks && Array.isArray(userTasks.tasks)) return userTasks.tasks;

  const bundled = join(PROJECT_ROOT, "tasks.example.json");
  if (existsSync(bundled)) {
    try {
      const parsed = JSON.parse(readFileSync(bundled, "utf8"));
      // Seed the user's data dir on first run so they have a file to edit.
      store.writeJson(TASKS_FILE, parsed);
      return parsed.tasks ?? [];
    } catch (err) {
      console.error("[config] failed to read bundled tasks:", err.message);
    }
  }
  return [];
}

export function saveTasks(tasks) {
  store.writeJson(TASKS_FILE, { tasks });
  return tasks;
}

/** A short, human-friendly pairing code shown in the agent console. */
export function generatePairingCode() {
  // 6 digits, easy to type on a phone.
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

/** Opaque bearer token handed to a paired client. */
export function generateToken() {
  return randomBytes(24).toString("hex");
}
