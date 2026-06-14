#!/usr/bin/env node
// bonjour-service is CommonJS: import the default export, then destructure.
import bonjourService from "bonjour-service";
const { Bonjour } = bonjourService;
import { env, VERSION } from "./config.js";
import { loadIdentity } from "./repositories/identity.repo.js";
import { armNewPairingCode } from "./services/pairing.service.js";
import { createApp, createHttpServer } from "./http/server.js";
import { localAddresses, isTailscaleAddress } from "./net/addresses.js";
import { onShutdown } from "./lifecycle.js";

/** Compose the app, start listening, advertise over Bonjour, and wire signals. */
function main(): void {
  const identity = loadIdentity();
  const app = createApp();
  const server = createHttpServer(app);

  let bonjour: InstanceType<typeof Bonjour> | undefined;

  function shutdown(): void {
    try {
      bonjour?.unpublishAll(() => bonjour?.destroy());
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
  onShutdown(shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Re-arm a fresh pairing code without restarting (kill -HUP <pid>).
  process.on("SIGHUP", () => armNewPairingCode());

  server.listen(env.port, env.host, () => {
    console.log("\n┌───────────────────────────────────────────────┐");
    console.log("│            QuickDesk Watch — Agent            │");
    console.log("└───────────────────────────────────────────────┘");
    console.log(`  Computer : ${identity.name} (${identity.os})`);
    console.log(`  Agent ID : ${identity.id}`);
    console.log(`  Version  : ${VERSION}`);
    console.log(`  Listening: http://${env.host}:${env.port}`);
    const addrs = localAddresses();
    if (addrs.length) {
      console.log(`  LAN URLs : ${addrs.map((a) => `http://${a}:${env.port}`).join("  ")}`);
    }
    console.log(`  Panel    : http://127.0.0.1:${env.port}/local`);
    console.log(`  Dangerous actions: ${identity.allowDangerousActions ? "ENABLED" : "disabled"}`);
    console.log(`  Auto pairing: ${env.autoPairing ? "ENABLED" : "disabled"}`);
    armNewPairingCode();
    console.log("  Enter this code in the QuickDesk iPhone app to pair.\n");

    // Advertise over Bonjour/mDNS so the app finds this agent automatically.
    try {
      bonjour = new Bonjour();
      const tailnetAddress = localAddresses().find(isTailscaleAddress);
      bonjour.publish({
        name: `QuickDesk ${identity.name}`.slice(0, 63),
        type: "quickdesk", // -> _quickdesk._tcp
        port: env.port,
        txt: {
          id: identity.id,
          name: identity.name,
          os: identity.os,
          v: VERSION,
          autoPairing: env.autoPairing ? "1" : "0",
          tailnetHost: tailnetAddress || "",
          tailnetPort: tailnetAddress ? String(env.port) : "",
        },
      });
      console.log("  📡 Advertising on the local network (Bonjour: _quickdesk._tcp)\n");
    } catch (err) {
      console.error("  (Bonjour advertising unavailable:", (err as Error).message + ")");
    }
  });
}

main();
