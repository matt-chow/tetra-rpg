import { COLS, ROWS, VISIBLE_ROWS } from "../game/constants.js";
import { FULL_ROW } from "./movegen.js";

// Static board features. Heights are measured from the floor in rows.
export function boardFeatures(rows) {
  const heights = new Array(COLS).fill(0);
  let holes = 0;
  let covered = 0;
  for (let x = 0; x < COLS; x++) {
    let top = -1;
    for (let y = 0; y < ROWS; y++) {
      if ((rows[y] >> x) & 1) {
        if (top < 0) top = y;
      } else if (top >= 0) {
        holes += 1;
        covered += Math.min(y - top, 4); // filled cells sitting on this hole, capped
      }
    }
    heights[x] = top < 0 ? 0 : ROWS - top;
  }

  let maxHeight = 0;
  let wellColumn = 0;
  for (let x = 0; x < COLS; x++) {
    maxHeight = Math.max(maxHeight, heights[x]);
    if (heights[x] < heights[wellColumn]) wellColumn = x;
  }

  let bumpiness = 0;
  let bumpSq = 0;
  let prev = -1;
  for (let x = 0; x < COLS; x++) {
    if (x === wellColumn) continue;
    if (prev >= 0) {
      const d = Math.abs(heights[x] - heights[prev]);
      bumpiness += d;
      bumpSq += d * d;
    }
    prev = x;
  }

  // Well depth: how far the lowest column sits below both its neighbours.
  const left = wellColumn > 0 ? heights[wellColumn - 1] : ROWS;
  const right = wellColumn < COLS - 1 ? heights[wellColumn + 1] : ROWS;
  const well = Math.max(0, Math.min(left, right, maxHeight) - heights[wellColumn]);

  let rowTransitions = 0;
  const topRow = ROWS - maxHeight;
  for (let y = topRow; y < ROWS; y++) {
    // Count filled/empty edges including both walls.
    const r = (rows[y] << 1) | 1 | (1 << (COLS + 1));
    rowTransitions += popcount((r ^ (r >> 1)) & ((1 << (COLS + 1)) - 1));
  }

  return { heights, maxHeight, holes, covered, bumpiness, bumpSq, well, rowTransitions, tslot: tSlot(rows, heights) };
}

function popcount(v) {
  let c = 0;
  while (v) {
    v &= v - 1;
    c += 1;
  }
  return c;
}

// Best T-spin double slot quality in [0, 1]: a 3-wide gap with one overhang
// corner, a single hole below the centre, and how complete the two rows are.
function tSlot(rows, heights) {
  let best = 0;
  for (let x = 0; x <= COLS - 3; x++) {
    const centreTop = ROWS - heights[x + 1];
    for (let y = Math.max(0, centreTop - 3); y <= Math.min(ROWS - 3, centreTop); y++) {
      const r0 = rows[y];
      const r1 = rows[y + 1];
      const r2 = rows[y + 2];
      const bit = (row, cx) => (row >> cx) & 1;
      if (bit(r0, x + 1) || bit(r1, x) || bit(r1, x + 1) || bit(r1, x + 2)) continue;
      if (bit(r2, x + 1) || !bit(r2, x) || !bit(r2, x + 2)) continue;
      if (bit(r0, x) === bit(r0, x + 2)) continue; // exactly one overhang
      const gap1 = (FULL_ROW & ~r1) & ~(0b111 << x); // other empty cells in the T row
      const gap2 = (FULL_ROW & ~r2) & ~(1 << (x + 1));
      const missing = popcount(gap1) + popcount(gap2);
      best = Math.max(best, 1 - missing / 8);
    }
  }
  return best;
}

// Higher is better. `w` holds profile weights; `incoming` is uncancelled garbage.
export function evaluateBoard(rows, w, incoming = 0) {
  const f = boardFeatures(rows);
  const effective = f.maxHeight + incoming;
  const dangerLine = VISIBLE_ROWS * 0.5;
  let score =
    w.holes * f.holes +
    w.covered * f.covered +
    w.bumpiness * f.bumpiness +
    w.bumpSq * f.bumpSq +
    w.rowTransitions * f.rowTransitions +
    w.height * f.maxHeight +
    w.well * Math.min(f.well, 4) +
    w.tslot * f.tslot;
  if (effective > dangerLine) score += w.danger * (effective - dangerLine) ** 2;
  return { score, features: f };
}
