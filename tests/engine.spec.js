import { describe, it, expect } from "vitest";
import { createGame, NEXT_PREVIEW_COUNT } from "../src/game/engine.js";
import { createBagRNG } from "../src/game/pieces.js";
import { clearLines } from "../src/game/board.js";
import { COLS, ROWS } from "../src/game/constants.js";

function bagSequence(seed, count) {
  const rng = createBagRNG({ seed });
  return Array.from({ length: count }, () => rng.next().type);
}

function hardDrop(game) {
  game.dropToFloor();
  return game.lock();
}

// Spreads pieces across the board so the stack grows slowly.
function dropSpread(game, i) {
  game.move(-5 + (i % 9), 0);
  return hardDrop(game);
}

describe("engine queue", () => {
  it("spawns the first bag draw and previews the next five", () => {
    const expected = bagSequence("q", 6);
    const state = createGame({ seed: "q" }).getState();
    expect(state.piece.type).toBe(expected[0]);
    expect(state.next).toEqual(expected.slice(1));
    expect(state.next).toHaveLength(NEXT_PREVIEW_COUNT);
  });

  it("spawns pieces in exact bag order across bag boundaries", () => {
    const game = createGame({ seed: "order" });
    const spawned = [game.getState().piece.type];
    for (let i = 0; i < 30; i++) {
      dropSpread(game, i);
      if (game.getState().toppedOut) break;
      spawned.push(game.getState().piece.type);
      expect(game.getState().next).toHaveLength(NEXT_PREVIEW_COUNT);
    }
    expect(spawned.length).toBeGreaterThanOrEqual(14);
    expect(spawned).toEqual(bagSequence("order", spawned.length));
  });

  it("preview always matches the upcoming bag draws", () => {
    const game = createGame({ seed: "preview" });
    const seq = bagSequence("preview", 40);
    for (let placed = 0; placed < 12; placed++) {
      expect(game.getState().next).toEqual(seq.slice(placed + 1, placed + 6));
      dropSpread(game, placed);
    }
  });
});

describe("engine hold", () => {
  it("first hold takes exactly one piece from the queue", () => {
    const seq = bagSequence("hold", 10);
    const game = createGame({ seed: "hold" });
    expect(game.hold()).toBe(true);
    const state = game.getState();
    expect(state.holdType).toBe(seq[0]);
    expect(state.piece.type).toBe(seq[1]);
    expect(state.next).toEqual(seq.slice(2, 7));
  });

  it("swapping with a filled hold does not consume the queue", () => {
    const seq = bagSequence("swap", 12);
    const game = createGame({ seed: "swap" });
    game.hold();
    hardDrop(game); // places seq[1], spawns seq[2]
    const before = game.getState().next;
    expect(game.hold()).toBe(true);
    const state = game.getState();
    expect(state.piece.type).toBe(seq[0]);
    expect(state.holdType).toBe(seq[2]);
    expect(state.next).toEqual(before);
  });

  it("allows one hold per piece until the piece locks", () => {
    const game = createGame({ seed: "once" });
    expect(game.hold()).toBe(true);
    const afterFirst = game.getState();
    expect(game.hold()).toBe(false);
    expect(game.getState()).toEqual(afterFirst);
    hardDrop(game);
    expect(game.getState().canHold).toBe(true);
    expect(game.hold()).toBe(true);
  });

  it("hold right after a hard drop holds the newly spawned piece", () => {
    // Regression: the old component could act on the just-locked piece here.
    const seq = bagSequence("drop-hold", 10);
    const game = createGame({ seed: "drop-hold" });
    hardDrop(game);
    game.hold();
    const state = game.getState();
    expect(state.holdType).toBe(seq[1]);
    expect(state.piece.type).toBe(seq[2]);
    expect(state.piecesPlaced).toBe(1);
  });

  it("swapped-in pieces spawn fresh in rotation state 0", () => {
    const game = createGame({ seed: "fresh" });
    game.hold();
    hardDrop(game);
    game.rotate("cw");
    game.move(1, 0);
    game.hold();
    const { piece } = game.getState();
    expect(piece.rot).toBe(0);
    expect(piece.y).toBe(0);
  });
});

describe("engine determinism and reset", () => {
  function script(game) {
    const log = [];
    for (let i = 0; i < 60 && !game.getState().toppedOut; i++) {
      if (i % 5 === 0) game.hold();
      if (i % 3 === 0) game.rotate(i % 2 ? "cw" : "ccw");
      log.push(dropSpread(game, i));
    }
    return { log, state: game.getState() };
  }

  it("same seed + same inputs gives an identical game", () => {
    expect(script(createGame({ seed: "replay" }))).toEqual(
      script(createGame({ seed: "replay" })),
    );
  });

  it("a new game with the same seed restarts from a clean state", () => {
    const fresh = createGame({ seed: "restart" }).getState();
    script(createGame({ seed: "restart" }));
    const restarted = createGame({ seed: "restart" }).getState();
    expect(restarted).toEqual(fresh);
    expect(restarted.holdType).toBeNull();
    expect(restarted.piecesPlaced).toBe(0);
    expect(restarted.board.flat().every((cell) => cell === 0)).toBe(true);
  });

  it("rapid moves, rotations and holds never consume extra pieces", () => {
    const seq = bagSequence("rapid", 10);
    const game = createGame({ seed: "rapid" });
    for (let i = 0; i < 500; i++) {
      game.move(i % 2 ? 1 : -1, 0);
      game.rotate(["cw", "ccw", "180"][i % 3]);
      game.hold();
    }
    // Only the first hold may draw: exactly one piece consumed.
    expect(game.getState().next).toEqual(seq.slice(2, 7));
  });
});

describe("engine collision and locking", () => {
  it("keeps pieces inside the walls and floor", () => {
    const game = createGame({ seed: "walls" });
    while (game.move(-1, 0));
    const left = game.getState().piece;
    expect(game.move(-1, 0)).toBe(false);
    while (game.move(1, 0));
    expect(game.getState().piece.x).toBeGreaterThan(left.x);
    expect(game.move(1, 0)).toBe(false);
    game.dropToFloor();
    expect(game.isGrounded()).toBe(true);
    expect(game.move(0, 1)).toBe(false);
  });

  it("does not lock an airborne piece", () => {
    const game = createGame({ seed: "air" });
    expect(game.lock()).toBeNull();
    expect(game.getState().piecesPlaced).toBe(0);
  });

  it("tops out by block-out and ignores further actions", () => {
    const game = createGame({ seed: "topout" });
    let result = null;
    for (let i = 0; i < 40 && !game.getState().toppedOut; i++) {
      result = hardDrop(game);
    }
    const state = game.getState();
    expect(state.toppedOut).toBe(true);
    expect(result.blockOut).toBe(true);
    expect(game.move(1, 0)).toBe(false);
    expect(game.rotate("cw")).toBe(false);
    expect(game.hold()).toBe(false);
    expect(game.lock()).toBeNull();
    expect(game.getState()).toEqual(state);
  });
});

describe("clearLines", () => {
  it("removes full rows and shifts the rest down", () => {
    const board = Array.from({ length: ROWS }, (_, y) =>
      Array(COLS).fill(y >= ROWS - 2 ? 1 : 0),
    );
    board[ROWS - 2][0] = 0;
    const { board: next, linesCleared } = clearLines(board);
    expect(linesCleared).toBe(1);
    expect(next).toHaveLength(ROWS);
    expect(next[ROWS - 1][0]).toBe(0);
    expect(next[ROWS - 1][1]).toBe(1);
    expect(next[0].every((cell) => cell === 0)).toBe(true);
  });
});
