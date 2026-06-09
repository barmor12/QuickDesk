#!/usr/bin/env node
/**
 * Installs the QuickDesk Watch approval hook into ~/.codex/hooks.json so Codex
 * PermissionRequest prompts get forwarded to your iPhone and Apple Watch.
 *
 * Usage:
 *   node scripts/install-codex-hook.mjs            # install (with backup)
 *   node scripts/install-codex-hook.mjs --remove   # uninstall
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS = join(homedir(), ".codex", "hooks.json");
const HOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "codex-watch-approval.mjs");
const COMMAND = `node ${HOOK_PATH}`;
const MATCHER = ".*";
const remove = process.argv.includes("--remove");

function load() {
  if (!existsSync(SETTINGS)) return {};
  try { return JSON.parse(readFileSync(SETTINGS, "utf8")); }
  catch {
    console.error("hooks.json is not valid JSON - aborting.");
    process.exit(1);
  }
}

function isOurs(hookGroup) {
  return hookGroup?.hooks?.some((h) => (h.command || "").includes("codex-watch-approval.mjs"));
}

const settings = load();
settings.hooks ||= {};
settings.hooks.PermissionRequest ||= [];
settings.hooks.PermissionRequest = settings.hooks.PermissionRequest.filter((g) => !isOurs(g));

if (!remove) {
  settings.hooks.PermissionRequest.push({
    matcher: MATCHER,
    hooks: [{ type: "command", command: COMMAND, statusMessage: "Waiting for QuickDesk approval" }],
  });
}

mkdirSync(dirname(SETTINGS), { recursive: true });
if (existsSync(SETTINGS)) copyFileSync(SETTINGS, SETTINGS + ".quickdesk.bak");
writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));

console.log(remove ? "Removed QuickDesk Codex approval hook." : "Installed QuickDesk Codex approval hook.");
console.log(`   settings: ${SETTINGS}`);
if (!remove) {
  console.log(`   matcher : ${MATCHER}`);
  console.log(`   command : ${COMMAND}`);
  console.log("\n   Codex will ask you to review/trust the hook in /hooks before it runs.");
}
