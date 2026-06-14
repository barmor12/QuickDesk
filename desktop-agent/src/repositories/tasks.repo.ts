import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { store } from "../infra/store.js";
import { AGENT_ROOT } from "../config.js";
import type { Task } from "../types.js";

const TASKS_FILE = "tasks.json";

/**
 * Tasks come from a user-editable tasks.json in the data dir. We fall back to
 * the bundled example (and seed the data dir from it on first run) so the agent
 * always boots with something useful.
 */
export function loadTasks(): Task[] {
  const userTasks = store.readJson<{ tasks?: Task[] } | null>(TASKS_FILE, null);
  if (userTasks && Array.isArray(userTasks.tasks)) return userTasks.tasks;

  const bundled = join(AGENT_ROOT, "tasks.example.json");
  if (existsSync(bundled)) {
    try {
      const parsed = JSON.parse(readFileSync(bundled, "utf8")) as { tasks?: Task[] };
      store.writeJson(TASKS_FILE, parsed);
      return parsed.tasks ?? [];
    } catch (err) {
      console.error("[tasks] failed to read bundled tasks:", (err as Error).message);
    }
  }
  return [];
}

export function saveTasks(tasks: Task[]): Task[] {
  store.writeJson(TASKS_FILE, { tasks });
  return tasks;
}
