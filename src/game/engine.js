import { createEmptyBoard, cloneBoard, clearLines } from "./board.js";
import { COLS, ROWS } from "./constants.js";
import { createBagRNG, createPieceByType } from "./pieces.js";
import { tryRotatePieceSRS } from "./rotation.js";

export const NEXT_PREVIEW_COUNT = 5;

export function collides(board, piece, dx, dy) {
  const { shape, x, y } = piece;
  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (!shape[py][px]) continue;
      const nx = x + px + dx;
      const ny = y + py + dy;

      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx] !== 0) return true;
    }
  }
  return false;
}

export function mergePiece(board, piece) {
  const next = cloneBoard(board);
  const { shape, x, y, id } = piece;
  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (!shape[py][px]) continue;
      const gx = x + px;
      const gy = y + py;
      if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
        next[gy][gx] = id;
      }
    }
  }
  return next;
}

export function getGhostPiece(board, piece) {
  let drop = 0;
  while (!collides(board, piece, 0, drop + 1)) {
    drop += 1;
  }
  return { ...piece, y: piece.y + drop };
}

function hasPieceCellsAboveTop(piece) {
  const { shape, y } = piece;
  for (let py = 0; py < shape.length; py++) {
    if (y + py < 0 && shape[py].some(Boolean)) return true;
  }
  return false;
}

// Deterministic single-player rules: board, active piece, 7-bag queue, hold,
// locking and line clears. Timing (gravity, lock delay, DAS) and scoring stay
// with the caller, so the same seed + the same calls always give the same game.
export function createGame({ seed, random, previewCount = NEXT_PREVIEW_COUNT } = {}) {
  const bag = createBagRNG({ seed, random });
  const queue = [];
  let board = createEmptyBoard();
  let piece = null;
  let holdType = null;
  let canHold = true;
  let piecesPlaced = 0;
  let lines = 0;
  let toppedOut = false;

  // The only place pieces leave the bag; keeps `previewCount` types visible.
  function takeNextType() {
    while (queue.length <= previewCount) queue.push(bag.next().type);
    return queue.shift();
  }

  // Returns false and tops out when the spawn position is blocked.
  function spawn(type) {
    const next = createPieceByType(type);
    if (collides(board, next, 0, 0)) {
      toppedOut = true;
      return false;
    }
    piece = next;
    return true;
  }

  spawn(takeNextType());

  return {
    getState() {
      return {
        board,
        piece,
        holdType,
        canHold,
        next: queue.slice(),
        piecesPlaced,
        lines,
        toppedOut,
      };
    },

    isGrounded() {
      return collides(board, piece, 0, 1);
    },

    move(dx, dy) {
      if (toppedOut || collides(board, piece, dx, dy)) return false;
      piece = { ...piece, x: piece.x + dx, y: piece.y + dy };
      return true;
    },

    rotate(direction, options) {
      if (toppedOut) return false;
      const rotated = tryRotatePieceSRS(board, piece, direction, options);
      if (rotated === piece) return false;
      piece = rotated;
      return true;
    },

    // Moves the piece straight down as far as it goes; returns rows moved.
    dropToFloor() {
      if (toppedOut) return 0;
      const ghost = getGhostPiece(board, piece);
      const rows = ghost.y - piece.y;
      piece = ghost;
      return rows;
    },

    // Locks a grounded piece, clears lines and spawns the next piece.
    // Returns null when nothing was locked.
    lock() {
      if (toppedOut || !collides(board, piece, 0, 1)) return null;

      const lockOut = hasPieceCellsAboveTop(piece);
      const cleared = clearLines(mergePiece(board, piece));
      board = cleared.board;
      lines += cleared.linesCleared;
      piecesPlaced += 1;
      canHold = true;

      if (lockOut) {
        toppedOut = true;
        return { linesCleared: cleared.linesCleared, lockOut: true, blockOut: false };
      }

      const blockOut = !spawn(takeNextType());
      return { linesCleared: cleared.linesCleared, lockOut: false, blockOut };
    },

    // Swaps with hold (drawing from the queue when hold is empty). Once per piece.
    hold() {
      if (toppedOut || !canHold) return false;
      canHold = false;
      const incoming = holdType ?? takeNextType();
      holdType = piece.type;
      spawn(incoming);
      return true;
    },
  };
}
