import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The panel is served by the agent under /local, so assets must resolve there.
// In dev, proxy the agent's loopback API + websocket to the running service.
const AGENT = "http://127.0.0.1:7420";
const apiPaths = ["/local/status", "/local/diagnostics", "/local/logs", "/local/pairing-code", "/local/pairings", "/local/restart", "/local/shutdown", "/health"];

export default defineConfig({
  base: "/local/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      ...Object.fromEntries(apiPaths.map((p) => [p, { target: AGENT, changeOrigin: true }])),
      "/ws": { target: AGENT, ws: true, changeOrigin: true },
    },
  },
});
