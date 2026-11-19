import { describe, it, expect } from "vitest";
import { createController } from "../src/input/controller.js";
import { createGame } from "../src/game/engine.js";
import { mergeSettings, DEFAULT_SETTINGS } from "../src/settings.js";

const still = { gravity: 0 };

describe("input controller", () => {
  it("replays presses in order, even within one frame", () => {
    const game = createGame({ seed: "c", rules: still });
    const input = createController({ das: 150, arr: 33, sdf: 20 });
    const type = game.getState().piece.type;
    input.press("hold");
    input.press("hardDrop");
    expect(input.update(game)).toEqual(["hold", "hardDrop"]);
    expect(game.getState().holdType).toBe(type);
    expect(game.getState().piecesPlaced).toBe(1);
  });

  it("a tap shorter than a frame still moves once", () => {
    const game = createGame({ seed: "c", rules: still });
    const input = createController({ das: 150, arr: 33, sdf: 20 });
    const x = game.getState().piece.x;
    input.press("left");
    input.release("left");
    input.update(game);
    for (let i = 0; i < 20; i++) input.update(game);
    expect(game.getState().piece.x).toBe(x - 1);
  });

  it("charges DAS then repeats at ARR, or snaps with ARR 0", () => {
    const run = (arr, frames) => {
      const game = createGame({ seed: "c", rules: still });
      const input = createController({ das: 100, arr, sdf: 20 });
      const x = game.getState().piece.x;
      input.press("right");
      for (let i = 0; i < frames; i++) input.update(game);
      return game.getState().piece.x - x;
    };
    expect(run(50, 5)).toBe(1); // 83ms: still charging
    expect(run(50, 6)).toBe(2); // 100ms: DAS charged, first repeat
    expect(run(50, 9)).toBe(3); // +50ms
    expect(run(0, 6)).toBeGreaterThan(2); // straight to the wall
  });

  it("holding both directions follows the most recent press", () => {
    const game = createGame({ seed: "c", rules: still });
    const input = createController({ das: 1000, arr: 33, sdf: 20 });
    const x = game.getState().piece.x;
    input.press("left");
    input.press("right");
    input.update(game);
    expect(game.getState().piece.x).toBe(x);
    input.release("right");
    for (let i = 0; i < 70; i++) input.update(game);
    expect(game.getState().piece.x).toBeLessThan(x - 1); // left DAS restarted on release
  });

  it("soft drop factor reaches the engine; 41+ is instant", () => {
    const game = createGame({ seed: "c" });
    const input = createController({ das: 150, arr: 33, sdf: 41 });
    input.press("softDrop");
    input.update(game);
    game.tick();
    expect(game.isGrounded()).toBe(true);
  });
});

describe("settings", () => {
  it("merges saved values over defaults and drops junk", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      handling: { das: 100, arr: "fast" },
      controls: { left: ["KeyJ"] },
      unknown: 1,
    });
    expect(merged.handling).toEqual({ das: 100, arr: 33, sdf: 20 });
    expect(merged.controls.left).toEqual(["KeyJ"]);
    expect(merged.controls.right).toEqual(["ArrowRight"]);
    expect(merged.unknown).toBeUndefined();
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
  });
});
