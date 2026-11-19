export const COLS = 10;
// TETR.IO field: 20 visible rows plus a 20-row buffer above them (40 total).
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 20;
export const ROWS = VISIBLE_ROWS + BUFFER_ROWS;
// Bounding-box top at spawn: pieces appear in rows 21-22, just above the visible field.
export const SPAWN_Y = BUFFER_ROWS - 2;

// Fixed simulation step. All rule timings below are in frames at this rate.
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

// Visuals
export const CELL_SIZE = 28; // pixels

// Piece IDs (board values). 0 = empty.
export const PIECE_IDS = {
  O: 1,
  I: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
};
export const GARBAGE_ID = 8;

// Colors keyed by the board cell value.
export const COLORS = {
  0: "#101014", // empty
  [PIECE_IDS.O]: "#FFD54F",
  [PIECE_IDS.I]: "#64C7FF",
  [PIECE_IDS.T]: "#B388FF",
  [PIECE_IDS.S]: "#69F0AE",
  [PIECE_IDS.Z]: "#FF6E6E",
  [PIECE_IDS.J]: "#5C6BC0",
  [PIECE_IDS.L]: "#FFB74D",
  [GARBAGE_ID]: "#6b6e7e",
};

// TETR.IO Season 1 versus defaults. Every value can be overridden per player
// through createGame({ rules }), which is the hook for hero/enemy modifiers.
export const DEFAULT_RULES = {
  gravity: 0.02, // G: cells per frame
  softDropBase: 0.02, // soft drop speed = factor x max(gravity, softDropBase)
  lockDelay: 30, // frames (500 ms)
  lockResets: 15, // successful moves/rotations that may restart lock delay
  garbageCap: 8, // max garbage lines inserted per piece
  garbageTravel: 20, // frames before received garbage can enter the board
  garbageMultiplier: 1,
  perfectClearBonus: 10, // Season 1 all-clear bonus (Season 2 changed this)
};
