// npm start: installs what's needed the first time, asks which game, starts it and opens the big
// screen in the browser. Only uses what comes with Node, so it runs before `npm install` has.
//   npm start                 asks which game
//   npm run party             the party games       npm run pictionary    PICTIONARY
//   Extra options go after --, for example: npm run party -- --tunnel
//   --tunnel    phones join through a Cloudflare tunnel (needs cloudflared)
//   --local     nothing on the network: pretend phones in other windows on this computer
//   --no-open   don't open the browser
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const GAMES = {
  party: { name: "Party games (MASH BATTLE, LIGHTS OUT, SPLIT SECOND, SNAKE ROYALE; up to 10 players)", screenPort: Number(process.env.PARTY_SCREEN_PORT) || 3101 },
  pictionary: { name: "PICTIONARY (teams, up to 150 players)", screenPort: Number(process.env.PICTIONARY_SCREEN_PORT) || 3201 },
};

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`This needs Node 22.13 or newer, and this computer has ${process.versions.node}. Get the LTS version from https://nodejs.org`);
  process.exit(1);
}

if (!fs.existsSync(path.join(root, "node_modules", "express"))) {
  console.log("First run: installing what the games need…");
  const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) {
    console.error("The install didn't finish. Check the internet connection and run npm start again.");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
let key = args.find((a) => a in GAMES);
if (!key) key = await askWhich();
const options = args.filter((a) => a !== key && a !== "--no-open");

const child = spawn(process.execPath, [path.join("server", key, "index.js"), ...options], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

if (!args.includes("--no-open")) openWhenReady(`http://localhost:${GAMES[key].screenPort}`);

async function askWhich() {
  const keys = Object.keys(GAMES);
  if (!process.stdin.isTTY) {
    console.error("Say which game: npm run party, or npm run pictionary.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nWhich game?");
  keys.forEach((k, i) => console.log(`  ${i + 1}. ${GAMES[k].name}`));
  for (;;) {
    const answer = (await rl.question("Type 1 or 2 and press Return: ")).trim();
    const picked = keys[Number(answer) - 1];
    if (picked) {
      rl.close();
      return picked;
    }
  }
}

function openWhenReady(url, tries = 40) {
  const again = () => {
    if (tries > 0) setTimeout(() => openWhenReady(url, tries - 1), 250);
  };
  http
    .get(url, (res) => {
      res.resume();
      const [cmd, ...rest] = process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
      spawn(cmd, [...rest, url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    })
    .on("error", again);
}
