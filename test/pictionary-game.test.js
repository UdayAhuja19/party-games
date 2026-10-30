// PICTIONARY's rules and state (server/pictionary/game.js), driven with a fake clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, judge, hintCount, pattern, MAX_PLAYERS, TEAMS, GUESS_MAX, GUESS_MIN, DRAW_MAX } from "../server/pictionary/game.js";

const WORDS = { easy: ["cat", "sun"], medium: ["elephant", "camel"], hard: ["ice cream", "lighthouse"] };
// random() = 0: the first tied drawer, the first unused word, and word 0 when time runs out.
const newGame = (timing = {}) => createGame({ random: () => 0, words: WORDS, timing });
const DRAW_MS = 80_000;

function fill(game, n, at = 0) {
  for (let i = 0; i < n; i += 1) game.join({ clientId: `p${i}`, name: `P${i}` }, at);
}
// Ids of the players in a team.
const team = (game, n, t) => Array.from({ length: n }, (_, i) => `p${i}`).filter((id) => game.player(id)?.team === t);

// Start, pick word `index` (0 = cat, 1 = elephant, 2 = ice cream) and start drawing at `at`.
function drawing(game, n, index = 1, at = 0) {
  fill(game, n);
  assert.deepEqual(game.start(at), { ok: true });
  const drawer = game.screenView(at).turn.drawer;
  const drawerId = [...Array(n).keys()].map((i) => `p${i}`).find((id) => game.player(id).name === drawer);
  assert.equal(game.pick(drawerId, index, at).status, "saved");
  assert.equal(game.beginDrawing(at), true);
  return drawerId;
}

test("guesses: exact (any case or spacing), close, or wrong", () => {
  assert.equal(judge("Elephant", "elephant"), "correct");
  assert.equal(judge(" ICE-CREAM! ", "ice cream"), "correct");
  assert.equal(judge("icecream", "ice cream"), "correct");
  assert.equal(judge("elefant", "elephant"), "close", "one letter off");
  assert.equal(judge("elephnat", "elephant"), "close", "two off in a long word");
  assert.equal(judge("elehpnat", "elephant"), "wrong", "three off is too far");
  assert.equal(judge("cats", "cat"), "close", "plural");
  assert.equal(judge("cream", "ice cream"), "close", "one word of two");
  assert.equal(judge("bat", "cat"), "wrong", "short words need the exact word");
  assert.equal(judge("giraffe", "elephant"), "wrong");
  assert.equal(judge("!!!", "cat"), "empty");
});

test("hints: a third of the letters at most, never more than three", () => {
  assert.equal(hintCount("cat"), 1);
  assert.equal(hintCount("camel"), 2);
  assert.equal(hintCount("elephant"), 3);
  assert.equal(hintCount("ice cream"), 3);
  assert.equal(pattern("ice cream", [0, 4]), "I__ C____");
});

test("players are balanced into six teams, and keep their team when they come back", () => {
  const game = newGame();
  fill(game, 100);
  const sizes = game.screenView(0).teams.map((t) => t.size);
  assert.deepEqual(sizes, [17, 17, 17, 17, 16, 16]);
  const before = game.player("p42").team;
  game.setConnected("p42", false);
  assert.equal(game.join({ clientId: "p42", name: "P42" }, 1).rejoined, true);
  assert.equal(game.player("p42").team, before);
  // Players offline don't count when balancing new players: red is down to 15 online.
  game.setConnected("p0", false);
  game.setConnected("p6", false);
  game.join({ clientId: "new", name: "NEW" }, 2);
  assert.equal(game.player("new").team, game.player("p0").team);
});

test(`at most ${MAX_PLAYERS} players`, () => {
  const game = newGame();
  fill(game, MAX_PLAYERS);
  assert.deepEqual(game.join({ clientId: "late", name: "LATE" }, 0), { full: true });
  assert.equal(game.join({ clientId: "p3", name: "P3" }, 0).rejoined, true, "a known player still gets back in");
});

test("a game needs players in at least two teams", () => {
  const game = newGame();
  assert.deepEqual(game.start(0), { error: "NEED PLAYERS IN AT LEAST 2 TEAMS." });
  fill(game, 1);
  assert.deepEqual(game.start(0), { error: "NEED PLAYERS IN AT LEAST 2 TEAMS." });
  fill(game, 2);
  assert.deepEqual(game.start(0), { ok: true });
});

test("only the drawer sees the word: never the projector, and not their own team", () => {
  const game = newGame();
  fill(game, 12);
  game.start(0);
  assert.equal(game.phase, "pick");
  const view = game.screenView(0);
  assert.equal(view.turn.team, 0, "red draws first");
  const drawerId = team(game, 12, 0).find((id) => game.player(id).name === view.turn.drawer);
  const mate = team(game, 12, 0).find((id) => id !== drawerId);
  const other = team(game, 12, 1)[0];
  assert.deepEqual(game.phoneView(drawerId, 0).turn.choices, ["cat", "elephant", "ice cream"]);
  assert.equal(game.phoneView(mate, 0).turn.choices, undefined);

  game.pick(drawerId, 1, 1000);
  for (const at of [1000, 2000]) {
    if (at === 2000) game.beginDrawing(at);
    for (const json of [JSON.stringify(game.screenView(at)), JSON.stringify(game.phoneView(mate, at)), JSON.stringify(game.phoneView(other, at))]) {
      assert.ok(!/elephant/i.test(json), `the word leaked in ${game.phase}`);
    }
    assert.equal(game.phoneView(drawerId, at).turn.word, "elephant");
  }
  // The reveal shows it to everyone.
  game.skipTurn(3000);
  assert.equal(game.screenView(3000).turn.word, "elephant");
  assert.equal(game.phoneView(other, 3000).turn.word, "elephant");
});

test("guessing: the drawing team can't, wrong guesses show, close ones don't, and one correct guess each", () => {
  const game = newGame();
  const drawerId = drawing(game, 12);
  const mate = team(game, 12, 0).find((id) => id !== drawerId);
  const [a, b] = team(game, 12, 1);
  assert.equal(game.guess(drawerId, "elephant", 100).status, "drawing-team");
  assert.equal(game.guess(mate, "elephant", 100).status, "drawing-team");
  assert.deepEqual(game.guess(a, "giraffe", 100), { status: "wrong", shown: "GIRAFFE" });
  assert.equal(game.guess(a, "mouse", 300).status, "too-fast");
  assert.deepEqual(game.guess(a, "elefant", 1000), { status: "close" });
  assert.deepEqual(game.guess(a, "elephant", 2000), { status: "correct", points: Math.round(GUESS_MAX - (GUESS_MAX - GUESS_MIN) * (2000 / DRAW_MS)), order: 1, ended: false });
  assert.equal(game.guess(a, "elephant", 3000).status, "already");
  assert.deepEqual(game.guess(b, "fuck", 3000), { status: "wrong", shown: null }, "rude guesses aren't shown");
  assert.equal(game.guess(b, "", 4000).status, "ignored");
  assert.equal(game.phoneView(a, 4000).turn.guessed, 295);
  assert.equal(game.phoneView(a, 4000).turn.canGuess, false);
});

test("a long wrong guess reaches the projector cut at a word, with an ellipsis", () => {
  const game = newGame();
  drawing(game, 12);
  const [a, b] = team(game, 12, 1);
  assert.deepEqual(game.guess(a, "is it a very big giraffe wearing a hat", 100), { status: "wrong", shown: "IS IT A VERY BIG…" });
  assert.deepEqual(game.guess(b, "supercalifragilisticexpialidocious", 100), { status: "wrong", shown: "SUPERCALIFRAGILISTICEXP…" });
});

test("team points are the average per player, so bigger teams don't win by size", () => {
  const game = newGame();
  drawing(game, 12); // 2 per team; red draws
  const [b1] = team(game, 12, 1);
  const [y1, y2] = team(game, 12, 2);
  game.guess(b1, "elephant", 0); // 300
  game.guess(y1, "elephant", DRAW_MS / 2); // 200
  game.guess(y2, "elephant", DRAW_MS / 2); // 200
  game.tick(DRAW_MS);
  assert.equal(game.phase, "reveal");
  const points = game.screenView(DRAW_MS).turn.teamPoints;
  assert.equal(points[1], 150, "blue: (300 + 0) / 2");
  assert.equal(points[2], 200, "yellow: (200 + 200) / 2");
  assert.equal(points[3], 0);
  assert.equal(points[0], Math.round((DRAW_MAX * 3) / 10), "red drew: 3 of 10 guessers got it");
  assert.deepEqual(game.screenView(DRAW_MS).teams.map((t) => t.score), points);
});

test("the turn ends as soon as everyone online has guessed", () => {
  const game = newGame();
  drawing(game, 6); // one per team
  const guessers = ["p1", "p2", "p3", "p4", "p5"].filter((id) => game.player(id).team !== 0);
  game.setConnected(guessers[4], false); // asleep: doesn't hold the turn up
  for (const id of guessers.slice(0, 3)) assert.equal(game.guess(id, "elephant", 5000).ended, false);
  assert.equal(game.guess(guessers[3], "elephant", 6000).ended, true);
  assert.equal(game.phase, "reveal");
  assert.equal(game.screenView(6000).turn.reason, "all");
});

test("letters are revealed at 40%, 60% and 80% of the time", () => {
  const game = newGame();
  drawing(game, 6);
  assert.equal(game.screenView(0).turn.pattern, "________");
  assert.equal(game.tick(DRAW_MS * 0.4 - 1), false);
  assert.equal(game.tick(DRAW_MS * 0.4), true);
  assert.equal(game.screenView(DRAW_MS * 0.4).turn.pattern.replaceAll("_", "").length, 1);
  game.tick(DRAW_MS * 0.8);
  const shown = game.screenView(DRAW_MS * 0.8).turn.pattern;
  assert.equal(shown.replaceAll("_", "").length, 3);
  assert.ok([...shown].every((ch, i) => ch === "_" || ch === "ELEPHANT"[i]));
});

test("no word picked in time: one is picked; the clock waits for the first line, however long", () => {
  const game = newGame({ pickMs: 15_000 });
  fill(game, 6);
  game.start(0);
  assert.equal(game.tick(14_999), false);
  assert.equal(game.tick(15_000), true);
  assert.equal(game.phase, "ready");
  assert.equal(game.screenView(15_000).turn.readyEndsAt, null);
  assert.equal(game.tick(60_000), false);
  assert.equal(game.tick(3_600_000), false, "an hour later it is still waiting");
  assert.equal(game.phase, "ready");
  assert.equal(game.beginDrawing(3_600_000), true);
  assert.equal(game.phase, "draw");
  assert.equal(game.screenView(3_600_000).turn.drawEndsAt, 3_600_000 + DRAW_MS);
});

test("nobody is called up to draw twice in a game, until the whole team has had a go", () => {
  // random() = 0.99 would always pick the last of the tied players: the same one, if allowed.
  const game = createGame({ random: () => 0.99, words: WORDS, timing: { revealMs: 10 } });
  fill(game, 6);
  game.setSettings({ teams: 2, rounds: 3, drawSeconds: 60 });
  game.start(0);
  const called = [[], []];
  let now = 0;
  for (let i = 0; i < 6; i += 1) {
    const turn = game.screenView(now).turn;
    called[turn.team].push(turn.drawer);
    // The host swaps the first drawer out before they draw: they still aren't called again.
    if (i === 0) {
      assert.deepEqual(game.skipDrawer(now), { ok: true });
      called[0].push(game.screenView(now).turn.drawer);
    }
    game.skipTurn(now);
    now += 100;
    game.tick(now);
  }
  assert.equal(new Set(called[1]).size, 3, "blue: three turns, three different drawers");
  assert.equal(new Set(called[0].slice(0, 3)).size, 3, "red: all three called before anyone repeats");
  assert.equal(called[0].length, 4, "red's fourth call has to be a repeat: only three players");
  // A new game starts everyone fresh.
  game.start(now);
  assert.ok(game.screenView(now).turn.drawer);
});

test("turns go round the teams, skip a team with nobody online, then the results", () => {
  const game = newGame({ revealMs: 1000 });
  fill(game, 10); // red and blue have 2, the rest 1 each... white has 1
  game.setSettings({ rounds: 1, drawSeconds: 60 });
  game.setConnected("p4", false); // black's only player
  game.start(0);
  const order = [];
  let now = 0;
  while (game.phase !== "results") {
    order.push(game.screenView(now).turn.team);
    game.skipTurn(now);
    now += 1000;
    game.tick(now);
  }
  assert.deepEqual(order, [0, 1, 2, 3, 5]);
  assert.equal(game.screenView(now).results.turns, 5);
});

test("everyone in a team draws before anyone draws twice", () => {
  const game = newGame({ revealMs: 1000 });
  fill(game, 18); // 3 per team
  game.setSettings({ rounds: 3, drawSeconds: 60 });
  game.start(0);
  const redDrawers = [];
  let now = 0;
  while (game.phase !== "results") {
    const turn = game.screenView(now).turn;
    if (turn.team === 0) redDrawers.push(turn.drawer);
    game.tick(now + 15_000); // word picked for them
    game.skipTurn(now + 15_000);
    now += 20_000;
    game.tick(now);
  }
  assert.equal(new Set(redDrawers).size, 3);
});

test("results rank the teams (ties share a place) and name the top guessers", () => {
  const game = newGame();
  drawing(game, 6);
  game.guess("p1", "elephant", 0);
  game.guess("p2", "elephant", 0);
  game.end(1000);
  const { ranking, top } = game.screenView(1000).results;
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[1].rank, 1, "blue and yellow tie");
  assert.equal(ranking[0].score, 300);
  assert.deepEqual(top.map((p) => p.points).slice(0, 2), [300, 300]);
  assert.equal(game.phoneView("p1", 1000).results.ranking.length, 6);
});

test("the host can swap the drawer, and a removed drawer is replaced", () => {
  const game = newGame();
  fill(game, 12);
  game.start(0);
  const first = game.screenView(0).turn.drawer;
  assert.deepEqual(game.skipDrawer(10), { ok: true });
  const second = game.screenView(10).turn.drawer;
  assert.notEqual(second, first);
  const secondId = team(game, 12, 0).find((id) => game.player(id).name === second);
  game.kick(secondId, 20);
  assert.equal(game.phase, "pick");
  assert.equal(game.screenView(20).turn.drawer, first);
  assert.deepEqual(game.skipDrawer(30), { error: "NOBODY ELSE ON THIS TEAM IS ONLINE." });
});

test("balancing evens out teams in the lobby", () => {
  const game = newGame();
  fill(game, 12);
  for (const id of team(game, 12, 0)) game.setConnected(id, false);
  for (const id of team(game, 12, 1)) game.setConnected(id, false);
  // Online: red 0, blue 0, the rest 2 each.
  assert.equal(game.balance(), 2);
  const online = game.screenView(0).teams.map((t) => t.online);
  assert.deepEqual(online, [1, 1, 1, 1, 2, 2]);
});

test("the holding switch stops the reveal from moving on", () => {
  const game = newGame({ revealMs: 1000 });
  drawing(game, 6);
  game.skipTurn(10);
  game.setHold(true);
  assert.equal(game.tick(5000), false);
  assert.equal(game.phase, "reveal");
  assert.equal(game.next(5000), true);
  assert.equal(game.phase, "pick");
  assert.equal(TEAMS[game.screenView(5000).turn.team].key, "blue");
});

test("each game's turns have their own key, so the projector never shows an old drawing", () => {
  const game = newGame();
  fill(game, 6);
  game.start(1000);
  const first = game.screenView(1000).turn.key;
  game.end(2000);
  game.start(3000);
  const second = game.screenView(3000).turn.key;
  assert.equal(game.screenView(3000).turn.number, 1);
  assert.notEqual(first, second);
});

test("the host picks 2, 4, 6 or 8 teams in the lobby, and players are shared out again", () => {
  const game = newGame();
  fill(game, 24);
  assert.equal(game.settings.teams, 6);
  const sizes = () => game.screenView(0).teams.map((t) => t.size);
  assert.deepEqual(sizes(), [4, 4, 4, 4, 4, 4]);
  game.setSettings({ teams: 2 });
  assert.deepEqual(sizes(), [12, 12]);
  assert.equal(game.screenView(0).roster.length, 2);
  assert.deepEqual(game.phoneView("p0", 0).scores, [0, 0]);
  game.setSettings({ teams: 8 });
  assert.deepEqual(sizes(), [3, 3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(game.screenView(0).teams.map((t) => t.name).slice(6), ["ORANGE", "PURPLE"]);
  game.setSettings({ teams: 4 });
  assert.deepEqual(sizes(), [6, 6, 6, 6]);
  game.setSettings({ teams: 5 });
  assert.equal(game.settings.teams, 4, "only 2, 4, 6 or 8");
  // A new player only ever lands in a team that's in use.
  game.join({ clientId: "late", name: "LATE" }, 0);
  assert.ok(game.player("late").team < 4);
  // Every turn of a round goes to one of the four teams, and the number is fixed once a game is on.
  game.setSettings({ rounds: 2 });
  assert.deepEqual(game.start(0), { ok: true });
  assert.equal(game.screenView(0).turn.total, 8);
  game.setSettings({ teams: 8 });
  assert.equal(game.settings.teams, 4);
  game.end(1);
  game.setSettings({ teams: 2 });
  assert.equal(game.settings.teams, 4, "not while the results are up");
});

test("eight teams play a whole round, and a saved roster comes back with its team count", () => {
  const game = newGame({ pickMs: 10, readyMs: 10, revealMs: 10 });
  fill(game, 16);
  game.setSettings({ teams: 8, rounds: 1, drawSeconds: 60 });
  assert.deepEqual(game.start(0), { ok: true });
  const drew = [];
  for (let now = 0; game.phase !== "results" && now < 2_000_000; now += 5) {
    const turn = game.screenView(now).turn;
    if (turn && drew.at(-1) !== turn.team) drew.push(turn.team);
    game.tick(now);
  }
  assert.deepEqual(drew, [0, 1, 2, 3, 4, 5, 6, 7]);
  const back = newGame();
  assert.equal(back.restore(game.roster(), 8), 16);
  assert.equal(back.settings.teams, 8);
  assert.equal(back.player("p7").team, game.player("p7").team);
  // An old save with no team count, or players beyond it, still lands everyone in a team in use.
  const old = newGame();
  old.restore([{ clientId: "aaaa", name: "A", team: 7 }]);
  assert.ok(old.player("aaaa").team < 6);
});
