#!/usr/bin/env node
/**
 * Installs the QuickDesk Watch approval hook into ~/.claude/settings.json so
 * Claude Code permission prompts get forwarded to your Apple Watch.
 *
 * Usage:
 *   node scripts/install-claude-hook.mjs            # install (with backup)
 *   node scripts/install-claude-hook.mjs --remove   # uninstall
 *
 * Safe: it backs up settings.json first and only touches the PreToolUse hook
 * entry it manages.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS = join(homedir(), ".claude", "settings.json");
const HOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "claude-watch-approval.mjs");
const COMMAND = `node ${HOOK_PATH}`;
const MATCHER = "Bash|Write|Edit|MultiEdit|WebFetch";
const remove = process.argv.includes("--remove");

function load() {
  if (!existsSync(SETTINGS)) return {};
  try { return JSON.parse(readFileSync(SETTINGS, "utf8")); }
  catch { console.error("settings.json is not valid JSON — aborting."); process.exit(1); }
}

function isOurs(hookGroup) {
  return hookGroup?.hooks?.some((h) => (h.command || "").includes("claude-watch-approval.mjs"));
}

const settings = load();
settings.hooks ||= {};
settings.hooks.PreToolUse ||= [];
// Drop any previously-installed copy of our hook.
settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((g) => !isOurs(g));

if (!remove) {
  settings.hooks.PreToolUse.push({
    matcher: MATCHER,
    hooks: [{ type: "command", command: COMMAND }],
  });
}

mkdirSync(dirname(SETTINGS), { recursive: true });
if (existsSync(SETTINGS)) copyFileSync(SETTINGS, SETTINGS + ".quickdesk.bak");
writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));

console.log(remove ? "✅ Removed QuickDesk approval hook." : "✅ Installed QuickDesk approval hook.");
console.log(`   settings: ${SETTINGS}`);
if (!remove) {
  console.log(`   matcher : ${MATCHER}`);
  console.log(`   command : ${COMMAND}`);
  console.log("\n   Make sure the agent is running, and DO NOT use --dangerously-skip-permissions");
  console.log("   (that bypasses all prompts, so nothing reaches your watch).");
}
