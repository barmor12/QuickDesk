import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Centralised, typed configuration. Everything the agent reads from the
 * environment is parsed once here so the rest of the codebase depends on a
 * single, well-named surface instead of scattered `process.env` access.
 */

export const VERSION = "2.0.0";

const __dirname = dirname(fileURLToPath(import.meta.url));

// At runtime this file lives in `dist/`, so one level up is the agent root
// (where tasks.example.json + package.json live) and two levels up is the repo.
export const AGENT_ROOT = join(__dirname, "..");
export const REPO_ROOT = join(AGENT_ROOT, "..");

export type OsKey = "darwin" | "win32" | "linux";

export const CURRENT_OS: OsKey = ((): OsKey => {
  const p = platform();
  return p === "win32" || p === "darwin" ? p : "linux";
})();

export function osLabel(os: OsKey = CURRENT_OS): string {
  switch (os) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    default:
      return "Linux";
  }
}

export const env = {
  port: Number(process.env.QUICKDESK_PORT || 7420),
  host: process.env.QUICKDESK_HOST || "0.0.0.0",
  autoPairing: process.env.QUICKDESK_AUTO_PAIRING !== "0",
  dataDir: process.env.QUICKDESK_DATA_DIR || join(homedir(), ".quickdesk"),
  apns: {
    topic: process.env.QUICKDESK_APNS_TOPIC || "com.barmor.quickdesk",
    environment: process.env.QUICKDESK_APNS_ENV || "sandbox",
    keyId: process.env.QUICKDESK_APNS_KEY_ID,
    teamId: process.env.QUICKDESK_APNS_TEAM_ID,
    keyPath: process.env.QUICKDESK_APNS_KEY_PATH,
  },
} as const;
