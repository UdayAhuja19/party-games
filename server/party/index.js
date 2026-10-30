// npm run party                 phones on the same Wi-Fi join this laptop directly
// npm run party -- --tunnel     phones join through a free Cloudflare tunnel (needs cloudflared)
// npm run party -- --local      nothing on the network: try it on this laptop only
import os from "node:os";
import { createPartyServer } from "./server.js";
import { startTunnel } from "./tunnel.js";

const args = new Set(process.argv.slice(2));
const mode = args.has("--tunnel") ? "tunnel" : args.has("--local") ? "local" : "lan";

const PHONE_PORT = Number(process.env.PARTY_PORT) || 3100;
const SCREEN_PORT = Number(process.env.PARTY_SCREEN_PORT) || 3101;

function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

const party = createPartyServer();
let tunnel = null;

try {
  await party.listen({
    phonePort: PHONE_PORT,
    phoneHost: mode === "lan" ? "0.0.0.0" : "127.0.0.1",
    screenPort: SCREEN_PORT,
  });
} catch (err) {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${err.port} is busy. Are the party games already running? Set PARTY_PORT / PARTY_SCREEN_PORT to use others.`);
    process.exit(1);
  }
  throw err;
}

console.log(`Big screen: http://localhost:${SCREEN_PORT}`);

if (mode === "tunnel") {
  tunnel = startTunnel(PHONE_PORT, (url, status) => {
    party.setJoin(url, status);
    if (status === "live") console.log(`Phones join at:        ${url}`);
    if (status === "starting") console.log("Starting the Cloudflare tunnel…");
    if (status === "down") console.log("The tunnel stopped. Restarting it with a new link…");
    if (status === "missing") {
      console.log("cloudflared isn't installed. Get it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (on a Mac: brew install cloudflared)");
      console.log("Or run `npm run party` with phones on the same Wi-Fi.");
    }
  });
} else if (mode === "lan") {
  const ip = lanAddress();
  const url = ip ? `http://${ip}:${PHONE_PORT}` : null;
  await party.setJoin(url, "lan");
  console.log(url ? `Phones on this Wi-Fi join at: ${url}` : "No Wi-Fi address found. Is this computer on Wi-Fi?");
} else {
  const url = `http://localhost:${PHONE_PORT}`;
  await party.setJoin(url, "off");
  console.log(`Open ${url} in new browser windows (side by side, not tabs) to act as phones.`);
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  tunnel?.stop();
  await party.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
