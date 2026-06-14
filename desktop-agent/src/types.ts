import type { OsKey } from "./config.js";

/** Domain types shared across the agent. */

export type ActionType =
  | "openApp"
  | "openUrl"
  | "runCommand"
  | "runScript"
  | "systemAction";

/**
 * An action value is either a single string (same on every OS) or a per-OS
 * map so a watch task fires the right command on Windows vs macOS vs Linux.
 * `default` is the catch-all when the current platform key is absent.
 */
export type PerOsValue = Partial<Record<OsKey, string>> & { default?: string };
export type ActionValue = string | PerOsValue;

export interface TaskAction {
  type: ActionType;
  value: ActionValue;
  order?: number;
}

export interface Task {
  id: string;
  name: string;
  icon?: string;
  category?: string;
  requiresConfirmation?: boolean;
  actions: TaskAction[];
}

export interface ActionResult {
  ok: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
}

export interface TaskExecutionResult {
  ok: boolean;
  output: string;
  error: string;
  results: Array<{ type: ActionType; value: ActionValue } & ActionResult>;
}

export interface PushRegistration {
  deviceToken: string;
  environment: string;
  updatedAt: string;
}

export interface PairedClient {
  id: string;
  name: string;
  token: string;
  pairedAt: string;
  push?: PushRegistration;
}

export interface Identity {
  id: string;
  name: string;
  os: string;
  pairedClients: PairedClient[];
  allowDangerousActions: boolean;
  localToken: string;
  createdAt: string;
}

/** The authenticated principal attached to a request by requireAuth. */
export interface AuthedClient {
  id: string;
  name: string;
  local?: boolean;
  token?: string;
  push?: PushRegistration;
}

export type ApprovalStatus = "pending" | "allowed" | "denied" | "expired";
export type ApprovalDecision = "allow" | "deny" | "expired" | null;

export interface ApprovalInput {
  title?: string;
  summary?: string;
  detail?: string;
  tool?: string | null;
  cwd?: string | null;
  source?: string;
}

export interface ApprovalView {
  id: string;
  source: string;
  title: string;
  summary: string;
  detail: string;
  tool: string | null;
  cwd: string | null;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  decision: ApprovalDecision;
}

export interface LogEntry {
  id: string;
  taskId: string;
  taskName: string;
  computerId: string;
  status: "pending" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  output: string;
  error: string;
}

/** A live event broadcast to paired phones/watches over WebSocket. */
export type RealtimeEvent =
  | { type: "execution.started"; log: LogEntry }
  | { type: "execution.finished"; log: LogEntry }
  | { type: "tasks.updated"; tasks: Task[] }
  | { type: "approval.created"; approval: ApprovalView }
  | { type: "approval.decided"; approval: ApprovalView }
  | { type: "approval.expired"; approval: ApprovalView };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      client?: AuthedClient;
    }
  }
}
