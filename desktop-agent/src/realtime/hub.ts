import type { WebSocket } from "ws";
import type { RealtimeEvent } from "../types.js";

/**
 * Tracks connected phone/watch WebSocket clients and fans live events out to
 * them. A single shared hub is imported wherever a broadcast is needed.
 */
class RealtimeHub {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket): void {
    this.clients.add(ws);
  }

  remove(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  get size(): number {
    return this.clients.size;
  }

  broadcast = (event: RealtimeEvent): void => {
    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  };
}

export const hub = new RealtimeHub();
