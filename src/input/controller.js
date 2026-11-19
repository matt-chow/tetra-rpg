import { FRAME_MS } from "../game/constants.js";
import { INSTANT_SDF } from "../settings.js";

const DISCRETE = { hardDrop: "hardDrop", hold: "hold", rotateCW: "cw", rotateCCW: "ccw", rotate180: "180" };

// Keyboard-agnostic handling for one player: presses and releases are queued
// as they happen and replayed in order on the next frame (no per-frame edge
// detection), then DAS/ARR and soft drop advance in fixed frame time.
// handling: { das, arr } in ms, sdf a soft drop gravity factor.
export function createController(handling) {
  let h = handling;
  const queue = [];
  const held = { left: false, right: false, softDrop: false };
  let direction = null; // last pressed horizontal direction still held
  let dasTimer = 0;
  let arrTimer = 0;

  function startDirection(dir) {
    direction = dir;
    dasTimer = 0;
    arrTimer = 0;
  }

  function shift(engine, dir, applied) {
    if (engine.apply(dir)) applied.push(dir);
  }

  return {
    press(control) {
      queue.push([control, true]);
    },
    release(control) {
      queue.push([control, false]);
    },
    setHandling(next) {
      h = next;
    },
    // Releases everything, e.g. on pause or window blur.
    reset() {
      queue.length = 0;
      held.left = held.right = held.softDrop = false;
      direction = null;
    },

    // Applies this frame's input to the engine and returns the actions taken.
    update(engine) {
      const applied = [];
      for (const [control, down] of queue.splice(0)) {
        if (control === "left" || control === "right") {
          held[control] = down;
          if (down) {
            startDirection(control);
            shift(engine, control, applied);
          } else if (direction === control) {
            const other = control === "left" ? "right" : "left";
            if (held[other]) startDirection(other);
            else direction = null;
          }
        } else if (control === "softDrop") {
          held.softDrop = down;
        } else if (down && DISCRETE[control]) {
          const result = engine.apply(DISCRETE[control]);
          if (result) applied.push(DISCRETE[control]);
        }
      }

      if (direction) {
        const charged = dasTimer >= h.das;
        dasTimer += FRAME_MS;
        if (dasTimer >= h.das) {
          if (h.arr <= 0) {
            if (engine.apply(direction === "left" ? "dasLeft" : "dasRight")) applied.push(direction);
          } else {
            // The first repeat lands on the frame DAS charges, then one every ARR ms.
            arrTimer = charged ? arrTimer + FRAME_MS : h.arr;
            while (arrTimer >= h.arr) {
              arrTimer -= h.arr;
              shift(engine, direction, applied);
            }
          }
        }
      }

      engine.setSoftDrop(held.softDrop, h.sdf >= INSTANT_SDF ? Infinity : h.sdf);
      return applied;
    },
  };
}
