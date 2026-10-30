// npm run pictionary               phones on the same Wi-Fi join this laptop directly
// npm run pictionary -- --tunnel   phones join through a free Cloudflare tunnel (needs cloudflared)
// npm run pictionary -- --local    nothing on the network: open the phone page in other windows
// npm run pictionary -- --preview  a second copy for trying changes while the real game is running:
//                                   local only, ports 3210/3211, its own scores file, no saved teams
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPictionaryServer } from "./server.js";
import { openScores } from "./scores.js";
import { startTunnel } from "../party/tunnel.js";

const args = new Set(process.argv.slice(2));
const preview = args.has("--preview");
const mode = preview ? "local" : args.has("--tunnel") ? "tunnel" : args.has("--local") ? "local" : "lan";

const PHONE_PORT = preview ? 3210 : Number(process.env.PICTIONARY_PORT) || 3200;
const SCREEN_PORT = preview ? 3211 : Number(process.env.PICTIONARY_SCREEN_PORT) || 3201;

function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

// Teams survive a restart: they're saved here (and ignored once they're 12 hours old).
const SAVE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.pictionary-teams.json");
// The scoreboard: the teams, every finished game and the host's tally, kept for good.
// A preview keeps its own scores file and no saved teams, so it can't touch the real game's.
const SCORES_FILE = preview ? "preview.db" : "pictionary.db";
const SCORES_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data", SCORES_FILE);
const scores = await openScores(SCORES_PATH);
const server = createPictionaryServer({ savePath: preview ? null : SAVE_PATH, scores });
let tunnel = null;

try {
  await server.listen({
    phonePort: PHONE_PORT,
    phoneHost: mode === "lan" ? "0.0.0.0" : "127.0.0.1",
    screenPort: SCREEN_PORT,
  });
} catch (err) {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${err.port} is busy. Is PICTIONARY already running? Set PICTIONARY_PORT / PICTIONARY_SCREEN_PORT to use others.`);
    process.exit(1);
  }
  throw err;
}

console.log(`PICTIONARY projector: http://localhost:${SCREEN_PORT}`);
console.log(scores ? `Scores and teams:     http://localhost:${SCREEN_PORT}/scores  (saved in data/${SCORES_FILE})` : "This Node has no built-in SQLite, so scores won't be saved. Update Node to 22.13 or newer.");
if (server.restored() > 0) console.log(`Brought back ${server.restored()} players in their teams from the last run. REMOVE EVERYONE on the projector starts fresh.`);

if (mode === "tunnel") {
  tunnel = startTunnel(PHONE_PORT, (url, status) => {
    server.setJoin(url, status);
    if (status === "live") console.log(`Phones join at:       ${url}`);
    if (status === "starting") console.log("Starting the Cloudflare tunnel…");
    if (status === "down") console.log("The tunnel stopped. Restarting it with a new link…");
    if (status === "missing") {
      console.log("cloudflared isn't installed. Get it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (on a Mac: brew install cloudflared)");
      console.log("Or run `npm run pictionary` with phones on the same Wi-Fi.");
    }
  });
} else if (mode === "lan") {
  const ip = lanAddress();
  const url = ip ? `http://${ip}:${PHONE_PORT}` : null;
  await server.setJoin(url, "lan");
  console.log(url ? `Phones on this Wi-Fi join at: ${url}` : "No Wi-Fi address found. Is this computer on Wi-Fi?");
} else {
  const url = `http://localhost:${PHONE_PORT}`;
  await server.setJoin(url, "off");
  console.log(`Open ${url}/?p=1, ?p=2 … in other windows to act as phones.`);
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  tunnel?.stop();
  await server.close();
  scores?.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
