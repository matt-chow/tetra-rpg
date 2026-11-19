import { COLS, ROWS } from "../game/constants.js";
import { getPieceShape, getKickOffsets } from "../game/rotation.js";
import { PIECE_TYPES } from "../game/pieces.js";
import { classifyTSpin } from "../game/attack.js";

// Bitboard: rows[y] has bit x set when board[y][x] is filled. Same indexing as the engine.
export const FULL_ROW = (1 << COLS) - 1;

export function toRows(board) {
  const rows = new Int32Array(ROWS);
  for (let y = 0; y < ROWS; y++) {
    let mask = 0;
    for (let x = 0; x < COLS; x++) if (board[y][x] !== 0) mask |= 1 << x;
    rows[y] = mask;
  }
  return rows;
}

const ROT_DELTA = { cw: 1, ccw: 3, 180: 2 };
const CELLS = {}; // CELLS[type][rot] = [px0, py0, px1, py1, ...]
const KICKS = {}; // KICKS[type][rot][dir] = [[dx, dy], ...]
for (const type of PIECE_TYPES) {
  CELLS[type] = [0, 1, 2, 3].map((rot) => {
    const cells = [];
    getPieceShape(type, rot).forEach((row, py) =>
      row.forEach((v, px) => {
        if (v) cells.push(px, py);
      }),
    );
    return cells;
  });
  KICKS[type] = [0, 1, 2, 3].map((rot) =>
    Object.fromEntries(
      Object.entries(ROT_DELTA).map(([dir, d]) => [dir, getKickOffsets(type, rot, (rot + d) % 4, dir, "tetrio")]),
    ),
  );
}

const cellsOf = (type, rot) => CELLS[type][rot];
const kicksOf = (type, rot, dir) => KICKS[type][rot][dir];

// Mirrors engine collides(): walls and floor block, rows above the top don't.
export function fits(rows, type, rot, x, y) {
  const c = cellsOf(type, rot);
  for (let i = 0; i < c.length; i += 2) {
    const nx = x + c[i];
    const ny = y + c[i + 1];
    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
    if (ny >= 0 && (rows[ny] >> nx) & 1) return false;
  }
  return true;
}

export function solidAt(rows, x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return true;
  return y >= 0 && ((rows[y] >> x) & 1) === 1;
}

// Sorted cell indices identify a placement independent of rotation state.
function signature(type, rot, x, y) {
  const c = cellsOf(type, rot);
  const ids = [];
  for (let i = 0; i < c.length; i += 2) ids.push((y + c[i + 1] + 8) * 16 + x + c[i]);
  return ids.sort((a, b) => a - b).join(",");
}

// Spin tag of an engine piece from getState().lastRotation.
export function spinOfRotation(lastRotation) {
  return lastRotation ? spinTag(lastRotation.kickIndex, lastRotation.direction) : 0;
}

// spin: 0 = last action was not a rotation, 1 = rotation, 2 = rotation via the 5th (TST) quarter-turn kick.
function spinTag(kickIndex, dir) {
  return kickIndex === 4 && dir !== "180" ? 2 : 1;
}

export function tspinOf(rows, p) {
  if (p.type !== "T" || p.spin === 0) return "none";
  return classifyTSpin((x, y) => solidAt(rows, x, y), p, {
    kickIndex: p.spin === 2 ? 4 : 0,
    direction: "cw",
  });
}

const ALL_ACTIONS = ["left", "right", "cw", "ccw", "180", "dasLeft", "dasRight", "sonicDrop"];
const TAP_ACTIONS = ["left", "right", "cw", "ccw", "180", "sonicDrop"];

function successor(rows, s, action) {
  const { type } = s;
  switch (action) {
    case "left":
    case "right": {
      const dx = action === "left" ? -1 : 1;
      return fits(rows, type, s.rot, s.x + dx, s.y) ? { ...s, x: s.x + dx, spin: 0 } : null;
    }
    case "dasLeft":
    case "dasRight": {
      const dx = action === "dasLeft" ? -1 : 1;
      let x = s.x;
      while (fits(rows, type, s.rot, x + dx, s.y)) x += dx;
      return Math.abs(x - s.x) > 1 ? { ...s, x, spin: 0 } : null;
    }
    case "sonicDrop": {
      let y = s.y;
      while (fits(rows, type, s.rot, s.x, y + 1)) y += 1;
      return y !== s.y ? { ...s, y, spin: 0 } : null;
    }
    default: {
      if (type === "O") return null; // O rotations never change its cells
      const to = (s.rot + ROT_DELTA[action]) % 4;
      const kicks = kicksOf(type, s.rot, action);
      for (let k = 0; k < kicks.length; k++) {
        const x = s.x + kicks[k][0];
        const y = s.y + kicks[k][1];
        if (fits(rows, type, to, x, y)) return { type, rot: to, x, y, spin: spinTag(k, action) };
      }
      return null;
    }
  }
}

function stateKey(s) {
  return ((s.rot * 32 + s.x + 8) * 64 + s.y + 8) * 3 + s.spin;
}

// BFS over (x, y, rot, spin) using the engine's moves and kicks with no gravity.
// visit(state, parentKey, action) is called once per new state.
function explore(rows, start, actions, visit) {
  const first = { type: start.type, rot: start.rot, x: start.x, y: start.y, spin: start.spin ?? 0 };
  const seen = new Set([stateKey(first)]);
  const queue = [first];
  if (visit(first, null, null) === false) return;
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    for (const action of actions) {
      const n = successor(rows, s, action);
      if (!n) continue;
      const key = stateKey(n);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(n);
      if (visit(n, s, action) === false) return;
    }
  }
}

function isGrounded(rows, s) {
  return !fits(rows, s.type, s.rot, s.x, s.y + 1);
}

function placementKey(s) {
  return signature(s.type, s.rot, s.x, s.y) + (s.type === "T" ? `|${s.spin}` : "");
}

// Every distinct lockable placement reachable from `piece` ({ type, x, y, rot }).
export function generatePlacements(rows, piece) {
  const found = new Map();
  explore(rows, piece, ALL_ACTIONS, (s) => {
    if (!isGrounded(rows, s)) return;
    const key = placementKey(s);
    if (!found.has(key)) found.set(key, { ...s, key });
  });
  return [...found.values()];
}

// Shortest action list that brings `piece` to a placement with the same key,
// ending in "hardDrop". null when the target is unreachable from here.
export function findPath(rows, piece, target, { useDas = true } = {}) {
  const parents = new Map();
  let goal = null;
  explore(rows, piece, useDas ? ALL_ACTIONS : TAP_ACTIONS, (s, parent, action) => {
    parents.set(stateKey(s), parent ? [stateKey(parent), action] : null);
    if (isGrounded(rows, s) && placementKey(s) === target.key) {
      goal = s;
      return false;
    }
  });
  if (!goal) return null;
  const path = ["hardDrop"];
  for (let link = parents.get(stateKey(goal)); link; link = parents.get(link[0])) {
    path.unshift(link[1]);
  }
  return path;
}

// Locks a placement on a copy of rows. lockOut when any cell is above the top.
export function place(rows, p) {
  const next = Int32Array.from(rows);
  const c = cellsOf(p.type, p.rot);
  let lockOut = false;
  for (let i = 0; i < c.length; i += 2) {
    const y = p.y + c[i + 1];
    if (y < 0) lockOut = true;
    else next[y] |= 1 << (p.x + c[i]);
  }
  let write = ROWS - 1;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (next[y] !== FULL_ROW) next[write--] = next[y];
  }
  const lines = write + 1;
  for (let y = write; y >= 0; y--) next[y] = 0;
  const perfectClear = lines > 0 && next[ROWS - 1] === 0;
  return { rows: next, lines, perfectClear, lockOut };
}
