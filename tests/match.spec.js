import { describe, it, expect } from "vitest";
import { createMatch } from "../src/game/match.js";
import { createEmptyBoard } from "../src/game/board.js";
import { GARBAGE_ID, ROWS } from "../src/game/constants.js";

function boardWithRow(text) {
  const board = createEmptyBoard();
  [...text].forEach((c, x) => (board[ROWS - 1][x] = c === "X" ? GARBAGE_ID : 0));
  return board;
}

// Player 0 of match seed `s` draws from "s:p0".
function seedWhereFirst(type) {
  for (let i = 0; i < 500; i++) {
    if (createMatch({ seed: `m${i}` }).players[0].getState().piece.type === type) return `m${i}`;
  }
  throw new Error("no seed");
}

function topOut(engine) {
  for (let i = 0; i < 60 && !engine.getState().toppedOut; i++) engine.apply("hardDrop");
}

describe("match", () => {
  it("gives each player an independent seeded bag", () => {
    const a = createMatch({ seed: "x" });
    const b = createMatch({ seed: "x" });
    const queue = (m, i) => m.players[i].getState().next.join("");
    expect(queue(a, 0)).toBe(queue(b, 0));
    expect(queue(a, 1)).toBe(queue(b, 1));
    expect(queue(a, 0)).not.toBe(queue(a, 1));
  });

  it("the survivor wins when one board tops out", () => {
    const match = createMatch({ seed: "end" });
    topOut(match.players[1]);
    const { result } = match.step();
    expect(result).toMatchObject({ winner: 0, reason: "topOut" });
    expect(match.step().events).toEqual([]); // frozen after the result
  });

  it("is a draw when both top out on the same frame", () => {
    const match = createMatch({ seed: "draw" });
    topOut(match.players[0]);
    topOut(match.players[1]);
    expect(match.step().result.winner).toBeNull();
  });

  it("routes sent garbage to the opponent after travel", () => {
    // A perfect-clear single sends 10.
    const seed = seedWhereFirst("I");
    const match = createMatch({ seed, initialBoards: [boardWithRow("XXX....XXX")] });
    const result = match.players[0].apply("hardDrop");
    expect(result.sent).toBe(10);
    const { events } = match.step();
    expect(events.some((e) => e.player === 1 && e.kind === "garbageQueued" && e.lines === 10)).toBe(true);
    const target = match.players[1];
    expect(target.pendingGarbage()).toBe(10);
    expect(target.getState().incoming[0].ready).toBe(19); // 20-frame travel, one frame elapsed
  });

  it("finishes a solo sprint at the goal", () => {
    const seed = seedWhereFirst("I");
    const sprint = createMatch({ seed, players: 1, goalLines: 1, initialBoards: [boardWithRow("XXX....XXX")] });
    expect(sprint.step().result).toBeNull();
    sprint.players[0].apply("hardDrop");
    expect(sprint.step().result).toMatchObject({ winner: 0, reason: "goal" });
  });

  it("runs the practice garbage trainer on its interval", () => {
    const practice = createMatch({ seed: "train", players: 1, trainer: { interval: 10, min: 1, max: 2 } });
    for (let i = 0; i < 9; i++) practice.step();
    expect(practice.players[0].pendingGarbage()).toBe(0);
    practice.step();
    const pending = practice.players[0].pendingGarbage();
    expect(pending).toBeGreaterThanOrEqual(1);
    expect(pending).toBeLessThanOrEqual(2);
  });
});
