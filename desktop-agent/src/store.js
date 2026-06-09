import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// All persistent state lives in ~/.quickdesk so it survives restarts and is
// kept out of the project directory.
const DATA_DIR = process.env.QUICKDESK_DATA_DIR || join(homedir(), ".quickdesk");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function pathFor(name) {
  return join(DATA_DIR, name);
}

function readJson(name, fallback) {
  const file = pathFor(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`[store] failed to parse ${name}, using fallback:`, err.message);
    return fallback;
  }
}

function writeJson(name, value) {
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
