import { COLS, ROWS } from "./constants.js";

// TETR.IO Season 1 base attack by lines cleared (index) and spin type.
export const ATTACK_TABLE = {
  none: [0, 0, 1, 2, 4],
  mini: [0, 0, 1, 2, 4],
  full: [0, 2, 4, 6, 8],
};

const TSPIN_CORNERS = [
  [0, 0], // top-left
  [2, 0], // top-right
  [2, 2], // bottom-right
  [0, 2], // bottom-left
];
// Corner indices the T points at, per rotation state 0, R, 2, L.
const FRONT_CORNERS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

function isSolid(board, x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return true;
  return y >= 0 && board[y][x] !== 0;
}

// 3-corner T-spin check for a T whose last successful action was a rotation.
// Full when both front corners are filled, or when the rotation used the 5th
// (TST) kick of a quarter turn; otherwise mini. Returns "none" | "mini" | "full".
export function detectTSpin(board, piece, lastRotation) {
  return classifyTSpin((x, y) => isSolid(board, x, y), piece, lastRotation);
}

// Same rule over any occupancy test; the AI calls this with its bitboard.
export function classifyTSpin(solidAt, piece, { kickIndex = -1, direction = "cw" } = {}) {
  if (piece.type !== "T") return "none";
  const solid = TSPIN_CORNERS.map(([cx, cy]) => solidAt(piece.x + cx, piece.y + cy));
  if (solid.filter(Boolean).length < 3) return "none";
  const [a, b] = FRONT_CORNERS[piece.rot];
  if (solid[a] && solid[b]) return "full";
  if (direction !== "180" && kickIndex === 4) return "full";
  return "mini";
}

// Season 1 "B2B chaining" bonus for a back-to-back counter of b2b (>= 1).
export function backToBackBonus(b2b) {
  if (b2b <= 0) return 0;
  const log = Math.log1p(b2b * 0.8);
  return Math.floor(1 + log) + (b2b === 1 ? 0 : (1 + (log % 1)) / 3);
}

// Lines of garbage a clear sends before cancellation.
// combo and b2b are counters after this clear: combo 0 = first clear in a row,
// b2b 0 = first difficult clear (no bonus yet), -1 = none.
export function computeAttack(
  { lines, tspin = "none", combo = -1, b2b = -1, perfectClear = false },
  { garbageMultiplier = 1, perfectClearBonus = 10 } = {},
) {
  if (lines <= 0) return 0;
  let garbage = ATTACK_TABLE[tspin]?.[lines] ?? 0;
  if (b2b > 0) garbage += backToBackBonus(b2b);
  if (combo > 0) {
    garbage *= 1 + 0.25 * combo;
    if (combo > 1) garbage = Math.max(Math.log1p(1.25 * combo), garbage);
  }
  garbage = Math.floor(garbage * garbageMultiplier);
  if (perfectClear) garbage += Math.floor(perfectClearBonus * garbageMultiplier);
  return garbage;
}

// Clears that keep back-to-back alive: quads and any T-spin that clears lines.
export function isDifficultClear(lines, tspin) {
  return lines >= 4 || (lines > 0 && tspin !== "none");
}

const LINE_NAMES = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"];

// Short label for UI popups, e.g. "T-SPIN MINI DOUBLE".
export function describeClear({ lines, tspin }) {
  const name = LINE_NAMES[lines] ?? "";
  if (tspin === "full") return `T-SPIN ${name}`.trim();
  if (tspin === "mini") return `T-SPIN MINI ${name}`.trim();
  return name;
}
