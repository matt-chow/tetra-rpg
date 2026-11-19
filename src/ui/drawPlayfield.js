import { BUFFER_ROWS, COLORS, COLS, PIECE_IDS, VISIBLE_ROWS } from "../game/constants.js";
import { getGhostPiece } from "../game/engine.js";
import { getOccupiedCells, getPieceShape } from "../game/rotation.js";
import { theme } from "./theme.js";

// Layout of one player's canvas: hold | meter | board | next.
export const CELL = 26;
const SIDE = CELL * 4 + 16;
const METER = 10;
const TOP = 24 + CELL * 2; // name band, then two buffer rows peek above the visible field
export const BOARD_X = SIDE + METER + 6;
export const WIDTH = BOARD_X + COLS * CELL + 8 + SIDE;
export const HEIGHT = TOP + VISIBLE_ROWS * CELL + 4;
const FIRST_ROW = BUFFER_ROWS - 2;

function cell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 1, y + 1, size - 2, 3);
  ctx.globalAlpha = 1;
}

function boardCell(ctx, bx, by, color, alpha) {
  if (by < FIRST_ROW) return;
  cell(ctx, BOARD_X + bx * CELL, TOP + (by - BUFFER_ROWS) * CELL, color, CELL, alpha);
}

function mini(ctx, type, cx, cy, size, dim) {
  if (!type) return;
  const shape = getPieceShape(type, 0);
  const rows = shape.filter((row) => row.some(Boolean));
  const top = shape.findIndex((row) => row.some(Boolean));
  const cols = shape[0].map((_, x) => shape.some((row) => row[x]));
  const left = cols.indexOf(true);
  const w = cols.lastIndexOf(true) - left + 1;
  const ox = cx - (w * size) / 2;
  const oy = cy - (rows.length * size) / 2;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < w; x++) {
      if (shape[top + y][left + x]) cell(ctx, ox + x * size, oy + y * size, dim ? "#55586a" : COLORS[PIECE_IDS[type]], size);
    }
  }
}

function label(ctx, text, x, y, align = "left") {
  ctx.fillStyle = theme.muted;
  ctx.font = `700 11px ${theme.mono}`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

// state: engine.getState(); view: { name, ghost, grid, danger, popups, flash }
export function drawPlayfield(ctx, state, view) {
  ctx.fillStyle = theme.appBg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Board well
  ctx.fillStyle = theme.boardBg;
  ctx.fillRect(BOARD_X, TOP, COLS * CELL, VISIBLE_ROWS * CELL);
  if (view.grid) {
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(BOARD_X + x * CELL + 0.5, TOP);
      ctx.lineTo(BOARD_X + x * CELL + 0.5, TOP + VISIBLE_ROWS * CELL);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(BOARD_X, TOP + y * CELL + 0.5);
      ctx.lineTo(BOARD_X + COLS * CELL, TOP + y * CELL + 0.5);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = view.danger ? theme.danger : theme.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X - 1, TOP - 1, COLS * CELL + 2, VISIBLE_ROWS * CELL + 2);
  ctx.lineWidth = 1;

  const { board, piece } = state;
  for (let y = FIRST_ROW; y < board.length; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x]) boardCell(ctx, x, y, COLORS[board[y][x]], state.toppedOut ? 0.45 : 1);
    }
  }

  if (piece && !state.toppedOut) {
    const color = COLORS[PIECE_IDS[piece.type]];
    if (view.ghost) {
      for (const c of getOccupiedCells(getGhostPiece(board, piece))) boardCell(ctx, c.x, c.y, color, 0.22);
    }
    // Fades toward the lock so a grounded piece reads as "about to lock".
    const lockFade = state.lockFrames > 0 ? 1 - Math.min(0.4, state.lockFrames / 75) : 1;
    for (const c of getOccupiedCells(piece)) boardCell(ctx, c.x, c.y, color, lockFade);
  }

  // Dev overlay: the bot's chosen placement (solid) and runner-up candidates (dashed).
  if (view.plan) {
    const outline = (target, color, dash) => {
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const c of getOccupiedCells(target)) {
        if (c.y >= FIRST_ROW) ctx.strokeRect(BOARD_X + c.x * CELL + 3, TOP + (c.y - BUFFER_ROWS) * CELL + 3, CELL - 6, CELL - 6);
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    };
    view.plan.candidates?.slice(1).forEach((c) => outline(c.target, "rgba(255,255,255,0.35)", [3, 3]));
    if (view.plan.target) outline(view.plan.target, "#ffffff", []);
  }

  // Hold
  label(ctx, "HOLD", 8, TOP + 12);
  mini(ctx, state.holdType, SIDE / 2, TOP + 46, 20, !state.canHold);

  // Next
  const nx = BOARD_X + COLS * CELL + 8;
  label(ctx, "NEXT", nx + 8, TOP + 12);
  state.next.slice(0, 5).forEach((type, i) => mini(ctx, type, nx + SIDE / 2, TOP + 46 + i * 62, 20 - (i ? 3 : 0), false));

  // Incoming garbage meter: red when it can land on the next lock, orange while travelling.
  const mx = BOARD_X - METER - 4;
  ctx.fillStyle = theme.panel;
  ctx.fillRect(mx, TOP, METER, VISIBLE_ROWS * CELL);
  let my = TOP + VISIBLE_ROWS * CELL;
  for (const g of state.incoming) {
    const h = Math.min(g.lines, VISIBLE_ROWS) * CELL;
    my -= h;
    ctx.fillStyle = g.ready <= 0 ? theme.danger : theme.warn;
    ctx.fillRect(mx, Math.max(TOP, my) + 1, METER, h - 2);
    if (my <= TOP) break;
  }

  // Stats under hold
  const s = state.stats;
  const lines = [
    ["PIECES", state.piecesPlaced],
    ["LINES", state.lines],
    ["ATTACK", s.attack],
    ["COMBO", Math.max(0, state.combo)],
    ["B2B", Math.max(0, state.b2b)],
  ];
  lines.forEach(([k, v], i) => {
    label(ctx, k, 8, TOP + 140 + i * 38);
    ctx.fillStyle = theme.text;
    ctx.font = `700 18px ${theme.mono}`;
    ctx.fillText(String(v), 8, TOP + 160 + i * 38);
  });

  // Name above the board
  if (view.name) {
    ctx.fillStyle = theme.text;
    ctx.font = `700 15px ${theme.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(view.name, BOARD_X + (COLS * CELL) / 2, 16);
    ctx.textAlign = "left";
  }

  // Clear/attack popups rise and fade over ~1s.
  for (const p of view.popups ?? []) {
    const t = p.age / 60;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = p.color;
    ctx.font = `800 ${p.big ? 22 : 16}px ${theme.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(p.text, BOARD_X + (COLS * CELL) / 2, TOP + VISIBLE_ROWS * CELL * 0.45 - t * 40 + p.slot * 24);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  if (state.toppedOut) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(BOARD_X, TOP, COLS * CELL, VISIBLE_ROWS * CELL);
    ctx.fillStyle = theme.danger;
    ctx.font = `800 26px ${theme.mono}`;
    ctx.textAlign = "center";
    ctx.fillText("TOP OUT", BOARD_X + (COLS * CELL) / 2, TOP + (VISIBLE_ROWS * CELL) / 2);
    ctx.textAlign = "left";
  }
}

// Screen-space anchors for attack projectiles.
export function boardCenter() {
  return { x: BOARD_X + (COLS * CELL) / 2, y: TOP + VISIBLE_ROWS * CELL * 0.5 };
}
export function meterTop() {
  return { x: BOARD_X - METER / 2 - 4, y: TOP + VISIBLE_ROWS * CELL - 20 };
}
