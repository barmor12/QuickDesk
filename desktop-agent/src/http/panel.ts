import express, { Router } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_ROOT, VERSION } from "../config.js";
import { requireLocal } from "./middleware.js";

/**
 * Serves the desktop control panel at /local. In production the panel is the
 * Vite/React build under ui/dist; if that hasn't been built yet we serve a
 * friendly placeholder telling the user how to build it. The /local/* JSON API
 * is mounted separately and takes precedence.
 */
const UI_DIST = join(AGENT_ROOT, "ui", "dist");

export const panelRoutes = Router();
panelRoutes.use(requireLocal);

if (existsSync(join(UI_DIST, "index.html"))) {
  panelRoutes.use(express.static(UI_DIST));
  // SPA fallback: any non-asset path returns index.html.
  panelRoutes.get("*", (_req, res) => res.sendFile(join(UI_DIST, "index.html")));
} else {
  panelRoutes.get("*", (_req, res) => res.type("html").send(placeholder()));
}

function placeholder(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QuickDesk Agent ${VERSION}</title>
<style>
  :root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
  .card{max-width:520px;padding:32px;border-radius:18px;background:color-mix(in srgb,CanvasText 6%,transparent);text-align:center}
  h1{margin:0 0 8px;font-size:26px}
  p{color:color-mix(in srgb,CanvasText 65%,transparent);line-height:1.5}
  code{background:color-mix(in srgb,CanvasText 12%,transparent);padding:3px 8px;border-radius:8px;font-size:14px}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#30d158;margin-right:8px}
</style></head><body>
<div class="card">
  <h1><span class="dot"></span>QuickDesk Agent ${VERSION}</h1>
  <p>The agent is running, but the desktop panel hasn't been built yet.</p>
  <p>From <code>desktop-agent/</code> run:</p>
  <p><code>npm run ui:build</code></p>
  <p>then refresh this page.</p>
</div></body></html>`;
}
