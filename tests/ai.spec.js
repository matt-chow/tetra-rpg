import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/engine.js";
import { createMatch } from "../src/game/match.js";
import { createSeededRandom } from "../src/game/pieces.js";
import { generatePlacements, findPath, toRows, place } from "../src/ai/movegen.js";
import { planMove } from "../src/ai/search.js";
import { createBot, snapshotOf } from "../src/ai/bot.js";
import { createSyncPlanner } from "../src/ai/planner.js";
import { AI_PROFILES, AI_PROFILE_ORDER } from "../src/ai/profiles.js";
import { GARBAGE_ID, ROWS, COLS } from "../src/game/constants.js";

// Random ragged stack with overhangs, so kicks and tucks matter.
function messyBoard(seed, height = 8) {
  const random = createSeededRandom(seed);
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let y = ROWS - height; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (random() < 0.55) board[y][x] = GARBAGE_ID;
    board[y][Math.floor(random() * COLS)] = 0;
  }
  return board;
}

function occupied(board) {
  return board.flatMap((row, y) => row.flatMap((v, x) => (v ? [`${x},${y}`] : []))).sort().join(" ");
}

describe("AI move generation", () => {
  it("every generated placement replays on the real engine to the same board", () => {
    let checked = 0;
    for (let i = 0; i < 12; i++) {
      const initialBoard = messyBoard(`legal${i}`);
      const probe = createGame({ seed: `legal${i}`, initialBoard });
      const { piece, board } = probe.getState();
      const rows = toRows(board);
      for (const target of generatePlacements(rows, piece)) {
        const game = createGame({ seed: `legal${i}`, initialBoard });
        const path = findPath(rows, piece, target);
        expect(path, `path for ${target.key}`).not.toBeNull();
        let result = null;
        for (const action of path) result = game.apply(action);
        expect(result).not.toBeNull();
        const expected = place(rows, target);
        expect(occupied(game.getState().board)).toBe(occupied(toBoard(expected.rows)));
        expect(result.linesCleared).toBe(expected.lines);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("finds T-spin placements the engine scores as T-spins", () => {
    // TSD slot from the rules spec, spawned T.
    const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    [".....X....", "XXX...XXXX", "XXXX.XXXXX"].forEach((text, i) =>
      [...text].forEach((c, x) => (board[ROWS - 3 + i][x] = c === "X" ? GARBAGE_ID : 0)),
    );
    const rows = toRows(board);
    const spin = { type: "T", x: 3, y: 18, rot: 0 };
    const target = generatePlacements(rows, spin).find((p) => place(rows, p).lines === 2);
    expect(target).toBeDefined();
    const seed = Array.from({ length: 200 }, (_, i) => `t${i}`).find(
      (s) => createGame({ seed: s }).getState().piece.type === "T",
    );
    const game = createGame({ seed, initialBoard: board });
    let result;
    for (const action of findPath(rows, game.getState().piece, target)) result = game.apply(action);
    expect(result.tspin).toBe("full");
    expect(result.attack).toBe(4);
  });
});

function toBoard(rows) {
  return Array.from(rows, (mask) => Array.from({ length: COLS }, (_, x) => ((mask >> x) & 1 ? 1 : 0)));
}

describe("AI planner", () => {
  it("is deterministic for a snapshot and seed", () => {
    const game = createGame({ seed: "det", initialBoard: messyBoard("det", 6) });
    const snap = snapshotOf(game);
    const a = planMove(snap, AI_PROFILES.master, { random: createSeededRandom("r") });
    const b = planMove(snap, AI_PROFILES.master, { random: createSeededRandom("r") });
    expect(a.target.key).toBe(b.target.key);
    expect(a.useHold).toBe(b.useHold);
    expect(a.nodes).toBe(b.nodes);
  });

  it("respects the node budget and the depth limit", () => {
    const snap = snapshotOf(createGame({ seed: "budget" }));
    const small = planMove(snap, { ...AI_PROFILES.legendary, nodes: 100 });
    expect(small.nodes).toBeLessThan(400);
    expect(planMove(snap, AI_PROFILES.apprentice).depth).toBe(1);
    expect(planMove(snap, AI_PROFILES.legendary).depth).toBe(4);
  });

  it("does not use hold when the engine says it is spent", () => {
    const game = createGame({ seed: "held" });
    game.apply("hold");
    const snap = snapshotOf(game);
    for (let i = 0; i < 10; i++) {
      expect(planMove(snap, AI_PROFILES.expert, { random: createSeededRandom(`h${i}`) }).useHold).toBe(false);
    }
  });
});

function runDuel(a, b, seed, maxFrames = 60 * 60 * 4) {
  const match = createMatch({ seed });
  const bots = [a, b].map((id, i) =>
    createBot({ profile: AI_PROFILES[id], seed: `${seed}:${i}`, planner: createSyncPlanner() }),
  );
  while (!match.getResult() && match.getFrame() < maxFrames) {
    bots.forEach((bot, i) => bot.update(match.players[i]));
    match.step();
  }
  return { match, bots };
}

describe("AI bots", () => {
  it("keeps each profile inside its PPS range", () => {
    for (const id of AI_PROFILE_ORDER) {
      const match = createMatch({ seed: `pps-${id}`, players: 1 });
      const bot = createBot({ profile: AI_PROFILES[id], seed: id, planner: createSyncPlanner() });
      const frames = 60 * 20;
      for (let f = 0; f < frames && !match.getResult(); f++) {
        bot.update(match.players[0]);
        match.step();
      }
      const pps = match.players[0].getState().piecesPlaced / (match.getFrame() / 60);
      const [lo, hi] = AI_PROFILES[id].pps;
      expect(pps, id).toBeGreaterThanOrEqual(lo * 0.85);
      expect(pps, id).toBeLessThanOrEqual(hi * 1.05);
    }
  }, 60000);

  it("never freezes when the planner never answers", () => {
    const match = createMatch({ seed: "silent", players: 1 });
    const bot = createBot({ profile: AI_PROFILES.master, seed: "s", planner: { request() {} } });
    for (let f = 0; f < 60 * 10; f++) {
      bot.update(match.players[0]);
      match.step();
    }
    expect(match.players[0].getState().piecesPlaced).toBeGreaterThan(5);
    expect(bot.stats.fallbacks).toBeGreaterThan(5);
  });

  it("plays a full AI match to a result, deterministically", () => {
    const first = runDuel("legendary", "apprentice", "duel-test");
    const result = first.match.getResult();
    expect(result).not.toBeNull();
    expect(result.winner).toBe(0);
    const again = runDuel("legendary", "apprentice", "duel-test");
    expect(again.match.getResult()).toEqual(result);
    const sent = first.match.players[0].getState().stats.sent;
    expect(sent).toBeGreaterThan(0);
    expect(first.match.players[1].getState().stats.received).toBe(sent);
  }, 120000);
});
