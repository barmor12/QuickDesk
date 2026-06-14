/**
 * Small indirection so HTTP route handlers can trigger a graceful shutdown
 * without importing the server (which owns Bonjour cleanup). The server
 * registers the real handler at startup.
 */
let handler: () => void = () => process.exit(0);

export function onShutdown(fn: () => void): void {
  handler = fn;
}

export function shutdown(): void {
  handler();
}
