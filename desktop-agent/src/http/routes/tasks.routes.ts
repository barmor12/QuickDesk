import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { loadIdentity } from "../../repositories/identity.repo.js";
import { loadTasks, saveTasks } from "../../repositories/tasks.repo.js";
import { executeTask } from "../../services/executor.service.js";
import { startLog, finishLog } from "../../repositories/logs.repo.js";
import { mergeDeveloperPack } from "../../services/developer-pack.js";
import { hub } from "../../realtime/hub.js";

/** Authenticated task management + execution. */
export const taskRoutes = Router();

taskRoutes.use(requireAuth);

taskRoutes.get("/tasks", (_req, res) => {
  res.json({ tasks: loadTasks() });
});

// Replace the full task list (iPhone task management).
taskRoutes.put("/tasks", (req, res) => {
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: "tasks_must_be_array" });
  }
  saveTasks(tasks);
  res.json({ tasks });
});

taskRoutes.post("/tasks/execute", async (req, res) => {
  const { taskId, confirmed } = req.body || {};
  const task = loadTasks().find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: "task_not_found" });

  // Sensitive tasks require an explicit confirmation flag from the client.
  if (task.requiresConfirmation && confirmed !== true) {
    return res.status(428).json({ error: "confirmation_required", task: { id: task.id, name: task.name } });
  }

  const identity = loadIdentity();
  const log = startLog({ taskId: task.id, taskName: task.name, computerId: identity.id });
  hub.broadcast({ type: "execution.started", log });

  const result = await executeTask(task);
  const finished = finishLog(log.id, {
    status: result.ok ? "success" : "failed",
    output: result.output,
    error: result.error,
  });
  if (finished) hub.broadcast({ type: "execution.finished", log: finished });

  res.status(result.ok ? 200 : 500).json({ ok: result.ok, log: finished, results: result.results });
});

taskRoutes.post("/tasks/developer-pack", (_req, res) => {
  const result = mergeDeveloperPack(loadTasks());
  saveTasks(result.tasks);
  hub.broadcast({ type: "tasks.updated", tasks: result.tasks });
  res.json({ ok: true, ...result });
});
