import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate persistence into a temp dir BEFORE importing modules that read it.
process.env.QUICKDESK_DATA_DIR = mkdtempSync(join(tmpdir(), "quickdesk-test-"));
process.env.QUICKDESK_PORT = "0"; // not used; we test modules directly

const { executeTask } = await import("../src/executor.js");
const { armPairing, completePairing } = await import("../src/auth.js");
const { generatePairingCode } = await import("../src/config.js");
const { startLog, finishLog, listLogs } = await import("../src/logger.js");
const { developerPackTasks, mergeDeveloperPack } = await import("../src/developer-pack.js");

test("executeTask runs ordered actions and succeeds", async () => {
  const res = await executeTask({
    id: "t1",
    name: "echo test",
    actions: [
      { type: "runCommand", value: "echo first", order: 1 },
      { type: "runCommand", value: "echo second", order: 2 },
    ],
  });
  assert.equal(res.ok, true);
  assert.match(res.output, /first/);
  assert.match(res.output, /second/);
});

test("executeTask stops at first failing action", async () => {
  const res = await executeTask({
    id: "t2",
    name: "fail test",
    actions: [
      { type: "runCommand", value: "exit 3", order: 1 },
      { type: "runCommand", value: "echo should-not-run", order: 2 },
    ],
  });
  assert.equal(res.ok, false);
  assert.doesNotMatch(res.output, /should-not-run/);
});

test("dangerous system action is blocked by default", async () => {
  const res = await executeTask({
    id: "t3",
    name: "shutdown",
    actions: [{ type: "systemAction", value: "shutdown", order: 1 }],
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /disabled|allowDangerousActions/);
});

test("pairing requires the correct armed code and is one-time", () => {
  const code = generatePairingCode();
  armPairing(code);

  const wrong = completePairing({ code: "000000", clientName: "x" });
  assert.equal(wrong.ok, false);

  // re-arm because a failed attempt does not disarm, but let's be explicit
  armPairing(code);
  const ok = completePairing({ code, clientName: "iPhone" });
  assert.equal(ok.ok, true);
  assert.ok(ok.token);

  // code is now consumed
  const reuse = completePairing({ code, clientName: "iPhone" });
  assert.equal(reuse.ok, false);
});

test("logs lifecycle: pending -> success", () => {
  const log = startLog({ taskId: "t1", taskName: "echo", computerId: "c1" });
  assert.equal(log.status, "pending");
  const done = finishLog(log.id, { status: "success", output: "ok", error: "" });
  assert.equal(done.status, "success");
  assert.ok(listLogs().some((l) => l.id === log.id));
});

test("developer pack installs useful tasks without duplicates", () => {
  const pack = developerPackTasks();
  assert.ok(pack.some((task) => task.id === "open-codex"));
  assert.ok(pack.some((task) => task.id === "open-claude-code"));
  assert.ok(pack.some((task) => task.id === "run-agent-tests"));

  const first = mergeDeveloperPack([{ id: "custom", name: "Custom", actions: [] }]);
  assert.equal(first.added, pack.length);
  assert.equal(first.tasks.filter((task) => task.id === "open-codex").length, 1);

  const second = mergeDeveloperPack(first.tasks);
  assert.equal(second.added, 0);
  assert.equal(second.updated, pack.length);
  assert.equal(second.tasks.filter((task) => task.id === "open-codex").length, 1);
});
