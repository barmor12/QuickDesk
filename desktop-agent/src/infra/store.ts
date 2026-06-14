import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env } from "../config.js";

/**
 * Tiny JSON file store. All persistent state lives under the data dir
 * (default ~/.quickdesk) so it survives restarts and stays out of the repo.
 */

const DATA_DIR = env.dataDir;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function pathFor(name: string): string {
  return join(DATA_DIR, name);
}

function readJson<T>(name: string, fallback: T): T {
  const file = pathFor(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (err) {
    console.error(`[store] failed to parse ${name}, using fallback:`, (err as Error).message);
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  ensureDir();
  writeFileSync(pathFor(name), JSON.stringify(value, null, 2), "utf8");
}

export const store = {
  DATA_DIR,
  ensureDir,
  pathFor,
  readJson,
  writeJson,
};
