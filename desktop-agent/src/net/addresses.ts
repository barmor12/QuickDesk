import { networkInterfaces } from "node:os";

/** Non-internal IPv4 addresses of this machine. */
export function localAddresses(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/** Tailscale assigns addresses in the 100.64.0.0/10 CGNAT range. */
export function isTailscaleAddress(address: string): boolean {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127;
}
