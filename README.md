# Party games

Two games for a room full of people, made by **GDG on Campus UOBD**. One computer runs the game and shows it on a big screen or projector. Everyone else scans a QR code and plays on their phone. There's nothing to install on the phones and no account to make.

| Game | Players | What happens |
|---|---|---|
| **Party games** | 1 to 10 | Quick rounds on the big screen: **MASH BATTLE** (tap to fill your bar first), **LIGHTS OUT** (F1 reaction test), **SPLIT SECOND** (stop a hidden timer on the target) and **SNAKE ROYALE** (last snake alive, up to 5 players). |
| **PICTIONARY** | Up to 150, in 2, 4, 6 or 8 teams | One player from a team draws on the computer. The other teams guess on their phones. It keeps score across rounds. |

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer (the LTS version is fine) and [Git](https://git-scm.com).

```bash
git clone https://github.com/UdayAhuja19/party-games.git
cd party-games
npm start
```

The first run installs what it needs. Pick a game, and the big screen opens in your browser with a QR code on it. Put that window on the projector, and everyone scans the code.

**Phones must be on the same Wi-Fi as the computer.** If your computer asks whether to allow incoming connections, click **Allow**. Press Ctrl+C in the terminal to stop.

To skip the question, run `npm run party` or `npm run pictionary` instead.

## If phones can't connect

Some Wi-Fi networks, especially at universities and offices, stop devices reaching each other. Use a free Cloudflare tunnel instead, so that phones can join on any network, including mobile data:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). On a Mac with Homebrew, that's `brew install cloudflared`.
2. Start the game with `--tunnel`:

```bash
npm run party -- --tunnel
```

```bash
npm run pictionary -- --tunnel
```

SNAKE ROYALE's steering is noticeably better over the same Wi-Fi than through a tunnel.

## Try it alone

`--local` keeps everything on your computer:

```bash
npm run party -- --local
```

Open http://localhost:3100 in separate browser windows (side by side, not tabs). Each window is a phone.

```bash
npm run pictionary -- --local
```

Open http://localhost:3200/?p=1, then `?p=2` and so on. Each number is a different player.

To fill PICTIONARY with pretend players while it runs in another terminal:

```bash
npm run bots -- 20 --smart
```

## Good to know

- **Scores:** PICTIONARY's scoreboard is at http://localhost:3201/scores, or use the SCORES button. It's saved in `data/pictionary.db` on your computer, and you can export it as a CSV.
- **Teams survive a restart:** a PICTIONARY game brings its teams back for 12 hours. REMOVE EVERYONE on the big screen starts fresh.
- **Ports:** the party games use 3100 (phones) and 3101 (big screen). PICTIONARY uses 3200 and 3201. To change them, set `PARTY_PORT`, `PARTY_SCREEN_PORT`, `PICTIONARY_PORT` or `PICTIONARY_SCREEN_PORT`.
- **The big screen is private:** its port only answers on the computer itself, so a phone can't open the host controls.

## Tests

```bash
npm test
```

## What's where

```
start.js             the launcher behind npm start
server/party/        party games server: rooms and the rules for each round
server/pictionary/   PICTIONARY server: game logic, words, scoreboard, QR codes
party/, pictionary/  the phone and big-screen pages
public/              shared styles, fonts, logos and game rules
scripts/             pretend phones for rehearsals
test/                tests
```
