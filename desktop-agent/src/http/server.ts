import express from "express";
import cors from "cors";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

import { publicRoutes } from "./routes/public.routes.js";
import { localApiRoutes } from "./routes/local.routes.js";
import { taskRoutes } from "./routes/tasks.routes.js";
import { logRoutes } from "./routes/logs.routes.js";
import { approvalRoutes } from "./routes/approvals.routes.js";
import { pushRoutes } from "./routes/push.routes.js";
import { panelRoutes } from "./panel.js";
import { hub } from "../realtime/hub.js";
import { loadIdentity } from "../repositories/identity.repo.js";

/** Build the Express app with every route registered in a clear order. */
export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  // Public discovery + pairing.
  app.use(publicRoutes);
  // Local-only surface: JSON API first, then the panel UI. Both are registered
  // before the authenticated routers below — otherwise their catch-all
  // requireAuth middleware would intercept GET /local and return 401.
  app.use("/local", localApiRoutes);
  app.use("/local", panelRoutes);
  // Authenticated API surfaces.
  app.use(taskRoutes);
  app.use(logRoutes);
  app.use(approvalRoutes);
  app.use(pushRoutes);

  return app;
}

/** Create the HTTP server and attach the authenticated WebSocket hub. */
export function createHttpServer(app: express.Express): Server {
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Authenticate the WS upgrade via ?token= since clients can't easily set
    // headers on the upgrade. Reload identity so clients paired after startup
    // are recognized.
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    const current = loadIdentity();
    const ok =
      token &&
      (current.localToken === token || current.pairedClients.some((c) => c.token === token));
    if (!ok) {
      ws.close(4001, "unauthorized");
      return;
    }
    (ws as unknown as { id: string }).id = randomUUID();
    hub.add(ws);
    ws.on("close", () => hub.remove(ws));
  });

  return server;
}
