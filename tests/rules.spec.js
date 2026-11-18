import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/engine.js";
import { computeAttack, backToBackBonus, detectTSpin } from "../src/game/attack.js";
import { createEmptyBoard } from "../src/game/board.js";
import { COLS, ROWS, SPAWN_Y, GARBAGE_ID } from "../src/game/constants.js";

// Finds a seed whose first piece is `type`, so setups are deterministic.
function seedStartingWith(type) {
  for (let i = 0; i < 500; i++) {
    if (createGame({ seed: `s${i}` }).getState().piece.type === type) return `s${i}`;
  }
  throw new Error("no seed");
}

function boardFromRows(rows) {
  const board = createEmptyBoard();
  rows.forEach((text, i) => {
    const y = ROWS - rows.length + i;
    [...text].forEach((c, x) => {
      board[y][x] = c === "X" ? GARBAGE_ID : 0;
    });
  });
  return board;
}

// T-spin double slot with the overhang on the right.
const TSD_ROWS = [
  ".....X....",
  "XXX...XXXX",
  "XXXX.XXXXX",
];

function playTSD(extra = {}) {
  const game = createGame({ seed: seedStartingWith("T"), initialBoard: boardFromRows(TSD_ROWS), ...extra });
  game.apply("ccw");
  game.apply("sonicDrop");
  game.apply("ccw");
  return { game, result: game.apply("hardDrop") };
}

describe("Season 1 attack table", () => {
  it("scores line clears and T-spins", () => {
    expect([1, 2, 3, 4].map((lines) => computeAttack({ lines }))).toEqual([0, 1, 2, 4]);
    expect([1, 2, 3].map((lines) => computeAttack({ lines, tspin: "full" }))).toEqual([2, 4, 6]);
    expect(computeAttack({ lines: 1, tspin: "mini" })).toBe(0);
    expect(computeAttack({ lines: 2, tspin: "mini" })).toBe(1);
    expect(computeAttack({ lines: 0, tspin: "full" })).toBe(0);
  });

  it("applies B2B chaining thresholds", () => {
    // Bonus is 0 for the first difficult clear, then 1, 1, 2 ... 2, 3 (from streak 9).
    expect(computeAttack({ lines: 4, b2b: 0 })).toBe(4);
    expect(computeAttack({ lines: 4, b2b: 1 })).toBe(5);
    expect(computeAttack({ lines: 2, tspin: "full", b2b: 1 })).toBe(5);
    expect(Math.floor(backToBackBonus(2))).toBe(1);
    expect(Math.floor(backToBackBonus(3))).toBe(2);
    expect(Math.floor(backToBackBonus(7))).toBe(2);
    expect(Math.floor(backToBackBonus(8))).toBe(3);
    expect(Math.floor(backToBackBonus(24))).toBe(4);
  });

  it("applies the multiplier combo table", () => {
    const singles = Array.from({ length: 8 }, (_, combo) => computeAttack({ lines: 1, combo }));
    // Singles have base 0, so only the ln(1 + 1.25 * combo) floor applies.
    expect(singles).toEqual([0, 0, 1, 1, 1, 1, 2, 2]);
    expect(computeAttack({ lines: 2, combo: 1 })).toBe(1);
    expect(computeAttack({ lines: 4, combo: 4 })).toBe(8);
  });

  it("adds 10 for a perfect clear and respects the garbage multiplier", () => {
    expect(computeAttack({ lines: 1, perfectClear: true })).toBe(10);
    expect(computeAttack({ lines: 4, perfectClear: true })).toBe(14);
    expect(computeAttack({ lines: 4 }, { garbageMultiplier: 1.5 })).toBe(6);
  });
});

describe("T-spin detection", () => {
  it("detects a T-spin double in the engine and sends 4", () => {
    const { game, result } = playTSD();
    expect(result.tspin).toBe("full");
    expect(result.linesCleared).toBe(2);
    expect(result.attack).toBe(4);
    expect(result.b2b).toBe(0);
    expect(game.getState().stats.tspins).toBe(1);
  });

  it("does not count a T that moved after rotating", () => {
    const board = boardFromRows(TSD_ROWS);
    const piece = { type: "T", rot: 2, x: 3, y: ROWS - 3 };
    expect(detectTSpin(board, piece, { kickIndex: 0 })).toBe("full");
    const game = createGame({ seed: seedStartingWith("T"), initialBoard: board });
    game.apply("ccw");
    game.apply("cw"); // last action is a rotation, but the T is airborne
    game.apply("sonicDrop"); // movement clears the spin flag
    expect(game.apply("hardDrop").tspin).toBe("none");
  });

  it("calls a mini unless both front corners are filled or the TST kick was used", () => {
    // T pointing right against the left wall: both back corners are the wall.
    const board = createEmptyBoard();
    const slot = { type: "T", rot: 1, x: -1, y: ROWS - 3 };
    expect(detectTSpin(board, slot, { kickIndex: 0 })).toBe("none");
    board[ROWS - 1][1] = GARBAGE_ID; // one front corner
    expect(detectTSpin(board, slot, { kickIndex: 0 })).toBe("mini");
    expect(detectTSpin(board, slot, { kickIndex: 4 })).toBe("full");
    expect(detectTSpin(board, slot, { kickIndex: 4, direction: "180" })).toBe("mini");
    board[ROWS - 3][1] = GARBAGE_ID; // both front corners
    expect(detectTSpin(board, slot, { kickIndex: 0 })).toBe("full");
  });
});

describe("gravity and lock delay", () => {
  it("falls at 0.02G and locks a grounded piece after 30 frames", () => {
    const game = createGame({ seed: "grav" });
    for (let i = 0; i < 50; i++) game.tick();
    expect(game.getState().piece.y).toBe(SPAWN_Y + 1);
    game.dropToFloor();
    for (let i = 0; i < 29; i++) expect(game.tick()).toBeNull();
    expect(game.tick()).not.toBeNull();
    expect(game.getState().piecesPlaced).toBe(1);
  });

  it("caps lock resets at 15", () => {
    const game = createGame({ seed: "stall", rules: { gravity: 0 } });
    game.dropToFloor();
    let frames = 0;
    while (game.getState().piecesPlaced === 0 && frames < 2000) {
      game.apply(frames % 2 ? "left" : "right");
      game.tick();
      frames += 1;
    }
    expect(game.getState().piecesPlaced).toBe(1);
    expect(frames).toBeLessThanOrEqual(15 + 30);
  });

  it("soft drop multiplies gravity and infinite soft drop sonic-drops", () => {
    const game = createGame({ seed: "sd" });
    game.setSoftDrop(true, 20); // 0.4G
    for (let i = 0; i < 10; i++) game.tick();
    expect(game.getState().piece.y).toBe(SPAWN_Y + 4);
    game.setSoftDrop(true, Infinity);
    game.tick();
    expect(game.isGrounded()).toBe(true);
    expect(game.getState().piecesPlaced).toBe(0);
  });
});

describe("garbage queue", () => {
  function lockNoClear(game) {
    return game.apply("hardDrop");
  }

  it("travels 20 frames, then enters on a lock without a clear", () => {
    const game = createGame({ seed: "g1" });
    game.receiveAttack(3);
    expect(lockNoClear(game).garbageAdded).toBe(0); // still travelling
    for (let i = 0; i < 20; i++) game.tick();
    expect(lockNoClear(game).garbageAdded).toBe(3);
    const { board } = game.getState();
    const bottom = board.slice(ROWS - 3);
    const holes = bottom.map((row) => row.indexOf(0));
    expect(new Set(holes).size).toBe(1);
    bottom.forEach((row) => expect(row.filter((c) => c === GARBAGE_ID)).toHaveLength(COLS - 1));
  });

  it("inserts at most 8 lines per piece", () => {
    const game = createGame({ seed: "cap" });
    game.receiveAttack(10, { delay: 0 });
    expect(lockNoClear(game).garbageAdded).toBe(8);
    expect(game.pendingGarbage()).toBe(2);
    expect(lockNoClear(game).garbageAdded).toBe(2);
  });

  it("changes the hole between separate attacks", () => {
    const game = createGame({ seed: "holes" });
    const holes = Array.from({ length: 20 }, () => game.receiveAttack(1, { delay: 0 }).hole);
    for (let i = 1; i < holes.length; i++) expect(holes[i]).not.toBe(holes[i - 1]);
  });

  it("outgoing attack cancels incoming garbage first", () => {
    const clean = playTSD();
    expect(clean.result.sent).toBe(4);

    const game = createGame({ seed: seedStartingWith("T"), initialBoard: boardFromRows(TSD_ROWS) });
    game.receiveAttack(3); // still travelling: cancellation doesn't wait for it
    game.apply("ccw");
    game.apply("sonicDrop");
    game.apply("ccw");
    const result = game.apply("hardDrop");
    expect(result.attack).toBe(4);
    expect(result.cancelled).toBe(3);
    expect(result.sent).toBe(1);
    expect(game.pendingGarbage()).toBe(0);
    expect(game.getState().stats).toMatchObject({ attack: 4, sent: 1, cancelled: 3, received: 3 });
  });

  it("a line clear blocks ready garbage for that piece", () => {
    const board = boardFromRows(["XXX....XXX"]);
    const seed = seedStartingWith("I");
    const game = createGame({ seed, initialBoard: board });
    game.receiveAttack(2, { delay: 0 });
    const result = game.apply("hardDrop");
    expect(result.linesCleared).toBe(1);
    expect(result.perfectClear).toBe(true);
    expect(result.garbageAdded).toBe(0);
    expect(result.attack).toBe(10);
    expect(result.cancelled).toBe(2);
  });

  it("tops out when garbage pushes the stack off the top", () => {
    const rows = Array.from({ length: ROWS - 2 }, (_, i) => (i % 2 ? "XXXXXXXXX." : ".XXXXXXXXX"));
    const game = createGame({ seed: "tall", initialBoard: boardFromRows(rows) });
    game.receiveAttack(8, { delay: 0 });
    game.apply("dasLeft");
    game.apply("hardDrop");
    const state = game.getState();
    expect(state.toppedOut).toBe(true);
  });

  it("garbage never changes the piece sequence", () => {
    const plain = createGame({ seed: "same" });
    const hit = createGame({ seed: "same" });
    const a = [];
    const b = [];
    for (let i = 0; i < 14; i++) {
      hit.receiveAttack(1, { delay: 0 });
      a.push(plain.getState().piece.type);
      b.push(hit.getState().piece.type);
      plain.apply("hardDrop");
      hit.apply("hardDrop");
      if (hit.getState().toppedOut) break;
    }
    expect(b).toEqual(a.slice(0, b.length));
    expect(b.length).toBeGreaterThanOrEqual(7);
  });
});

describe("engine events", () => {
  it("reports spawns, holds and locks in order", () => {
    const game = createGame({ seed: "ev" });
    game.apply("hold");
    game.apply("hardDrop");
    const kinds = game.drainEvents().map((e) => e.kind);
    expect(kinds).toEqual(["spawn", "hold", "lock", "spawn"]);
    expect(game.drainEvents()).toEqual([]);
  });
});
