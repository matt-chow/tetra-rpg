import { useEffect, useRef, useState, useCallback } from "react";
import { createEmptyBoard } from "../game/board";
import { createGame, getGhostPiece, NEXT_PREVIEW_COUNT } from "../game/engine";
import { createPieceByType } from "../game/pieces";
import { formatCells } from "../game/rotation";
import { calculatePPS, formatDuration } from "../game/sprint";
import {
  COLS,
  ROWS,
  CELL_SIZE,
  COLORS,
} from "../game/constants";

// Legacy wall-clock tuning, kept local until this component is replaced by the frame loop.
const GRAVITY_FAST = 60;
const SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };
const LINES_PER_LEVEL = 10;
function gravityForLevel(level) {
  return Math.max(100, 800 - level * 60);
}

// Overlay the active piece onto a copy of the board to render.
function cellsWithCurrentPiece(board, piece) {
  const view = board.map((row) => row.slice());
  const { shape, x, y, id } = piece;

  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (!shape[py][px]) continue;
      const gx = x + px;
      const gy = y + py;
      if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
        view[gy][gx] = id; // use piece.id so color matches the tetromino
      }
    }
  }
  return view;
}

function getPieceCellSet(piece) {
  const cells = new Set();
  const { shape, x, y } = piece;

  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (!shape[py][px]) continue;
      const gx = x + px;
      const gy = y + py;
      if (gy < 0 || gy >= ROWS || gx < 0 || gx >= COLS) continue;
      cells.add(`${gx},${gy}`);
    }
  }

  return cells;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean
      .split("")
      .map((c) => c + c)
      .join("")
    : clean;

  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return `rgba(255,255,255,${alpha})`;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function levelForLines(lines) {
  return Math.floor(lines / LINES_PER_LEVEL);
}

// What the board shows before the first game is created.
function createIdleSnapshot() {
  return {
    board: createEmptyBoard(),
    piece: null,
    holdType: null,
    canHold: true,
    next: [],
    piecesPlaced: 0,
    lines: 0,
    toppedOut: false,
  };
}

// TETR.IO default lock delay is 30 frames at 60 Hz (~500 ms).
const LOCK_DELAY_MS = 500;
const COUNTDOWN_STEPS = ["3", "2", "1", "GO"];
const COUNTDOWN_STEP_MS = 450;
const COUNTDOWN_GO_DELAY_MS = 120;
const PREVIEW_BOX = 4;
const PREVIEW_CELL = 12;

const INPUT_TIMING = {
  DAS_MS: 150,
  ARR_MS: 40,
};

const CONTROL_KEY_CODES = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  softDrop: ["ArrowDown"],
  rotateCW: ["ArrowUp", "KeyX"],
  rotateCCW: ["KeyZ"],
  rotate180: ["KeyA"],
  hardDrop: ["Space"],
  hold: ["KeyC"],
  pause: ["KeyP", "Escape"],
  reset: ["KeyR"],
};

const CODE_TO_CONTROLS = Object.entries(CONTROL_KEY_CODES).reduce(
  (map, [control, codes]) => {
    codes.forEach((code) => {
      if (!map[code]) map[code] = [];
      map[code].push(control);
    });
    return map;
  },
  {},
);

const REPEATABLE_CONTROLS = ["left", "right"];

// Presses are queued on keydown and replayed in press order on the next frame,
// so taps shorter than a frame are never lost and hold-then-drop stays in order.
const QUEUED_CONTROLS = [
  "left",
  "right",
  "hardDrop",
  "hold",
  "rotateCW",
  "rotateCCW",
  "rotate180",
];

const REPEATABLE_CONTROL_SET = new Set(REPEATABLE_CONTROLS);
const QUEUED_CONTROL_SET = new Set(QUEUED_CONTROLS);

function createInitialKeyState() {
  return {
    left: false,
    right: false,
    softDrop: false,
    rotateCW: false,
    rotateCCW: false,
    rotate180: false,
    hardDrop: false,
    hold: false,
    pause: false,
    reset: false,
  };
}

function createInitialRepeatTiming() {
  return {
    left: { nextRepeatAt: 0, pressedAt: 0 },
    right: { nextRepeatAt: 0, pressedAt: 0 },
  };
}

function renderMiniPiece(type) {
  if (!type) {
    return (
      <div
        style={{
          color: "#8e90a6",
          fontSize: 12,
          textAlign: "center",
          padding: "8px 0",
        }}
      >
        Empty
      </div>
    );
  }

  const spawned = createPieceByType(type);
  if (!spawned) {
    return null;
  }

  const { shape, id } = spawned;
  const shapeH = shape.length;
  const shapeW = shape[0].length;
  const offsetX = Math.floor((PREVIEW_BOX - shapeW) / 2);
  const offsetY = Math.floor((PREVIEW_BOX - shapeH) / 2);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${PREVIEW_BOX}, ${PREVIEW_CELL}px)`,
        gridTemplateRows: `repeat(${PREVIEW_BOX}, ${PREVIEW_CELL}px)`,
        gap: 1,
        justifyContent: "center",
      }}
    >
      {Array.from({ length: PREVIEW_BOX * PREVIEW_BOX }, (_, i) => {
        const px = i % PREVIEW_BOX;
        const py = Math.floor(i / PREVIEW_BOX);
        const sx = px - offsetX;
        const sy = py - offsetY;
        const filled =
          sy >= 0 &&
          sy < shapeH &&
          sx >= 0 &&
          sx < shapeW &&
          shape[sy][sx];

        return (
          <div
            key={`mini-${type}-${i}`}
            style={{
              width: PREVIEW_CELL,
              height: PREVIEW_CELL,
              borderRadius: 2,
              background: filled ? COLORS[id] : "#14151d",
              boxShadow: filled ? "inset 0 0 2px rgba(0,0,0,0.35)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

export default function GameBoard({
  gameMode,
  sprintTargetLines = 40,
  allowManualReset = true,
  onBackToMenu,
}) {
  const [gamePhase, setGamePhase] = useState("idle");
  const [countdownLabel, setCountdownLabel] = useState(null);
  const urlParams = useRef(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(),
  ).current;
  const debugRotation = urlParams.has("debugRotation");
  // ?seed=<text> makes the piece sequence reproducible for debugging.
  const bagSeed = urlParams.get("seed") ?? undefined;

  // The engine is the single source of truth for game state. `game` is only a
  // render snapshot of it; never read gameplay decisions from React state.
  const engineRef = useRef(null);
  const [game, setGame] = useState(createIdleSnapshot);

  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [runSummary, setRunSummary] = useState(null);
  const [useInfiniteSoftDrop, setUseInfiniteSoftDrop] = useState(false);
  const [score, setScore] = useState(0);

  const rootRef = useRef(null);
  const runOverRef = useRef(false);
  const gravityAccumulatorRef = useRef(0);
  const lastFrameTimeRef = useRef(null);
  const frameIdRef = useRef(null);
  const lockTimerRef = useRef(null);
  const countdownTimersRef = useRef([]);
  const countdownRunIdRef = useRef(0);
  const elapsedTimeRef = useRef(0);
  const pressedKeysRef = useRef(new Set());
  const keyStateRef = useRef(createInitialKeyState());
  const repeatTimingRef = useRef(createInitialRepeatTiming());
  const actionQueueRef = useRef([]);

  const isSprintMode = gameMode === "sprint";

  const syncGame = useCallback(() => {
    setGame(engineRef.current.getState());
  }, []);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current === null) return;
    clearTimeout(lockTimerRef.current);
    lockTimerRef.current = null;
  }, []);

  const clearCountdownTimers = useCallback(() => {
    if (!countdownTimersRef.current.length) return;
    countdownTimersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    countdownTimersRef.current = [];
  }, []);

  const startNewGame = useCallback(() => {
    clearLockTimer();

    engineRef.current = createGame({ seed: bagSeed });
    runOverRef.current = false;
    gravityAccumulatorRef.current = 0;
    lastFrameTimeRef.current = null;
    elapsedTimeRef.current = 0;

    syncGame();
    setElapsedTimeMs(0);
    setRunSummary(null);
    setScore(0);
  }, [bagSeed, clearLockTimer, syncGame]);

  const clearInputState = useCallback(() => {
    pressedKeysRef.current.clear();
    keyStateRef.current = createInitialKeyState();
    repeatTimingRef.current = createInitialRepeatTiming();
    actionQueueRef.current = [];
    gravityAccumulatorRef.current = 0;
    lastFrameTimeRef.current = null;
  }, []);

  const setControlPressed = useCallback((control, isPressed, timestamp) => {
    const currentState = keyStateRef.current[control];
    if (currentState === isPressed) return;

    keyStateRef.current[control] = isPressed;

    if (REPEATABLE_CONTROL_SET.has(control)) {
      const timing = repeatTimingRef.current[control];
      timing.pressedAt = isPressed ? timestamp : 0;
      timing.nextRepeatAt = isPressed ? timestamp + INPUT_TIMING.DAS_MS : 0;
    }

    if (isPressed && QUEUED_CONTROL_SET.has(control)) {
      actionQueueRef.current.push(control);
    }
  }, []);

  const syncControlForCode = useCallback((code, isPressed, timestamp) => {
    const controls = CODE_TO_CONTROLS[code];
    if (!controls) return;

    if (isPressed) {
      pressedKeysRef.current.add(code);
    } else {
      pressedKeysRef.current.delete(code);
    }

    controls.forEach((control) => {
      const pressed = CONTROL_KEY_CODES[control].some((boundCode) =>
        pressedKeysRef.current.has(boundCode),
      );
      setControlPressed(control, pressed, timestamp);
    });
  }, [setControlPressed]);

  // Auto-repeat after DAS; the initial tap itself is queued on keydown.
  const pollRepeatControl = useCallback((control, now, allowFire = true) => {
    if (!keyStateRef.current[control]) return false;

    const timing = repeatTimingRef.current[control];
    if (now < timing.nextRepeatAt) return false;

    timing.nextRepeatAt = now + INPUT_TIMING.ARR_MS;
    return allowFire;
  }, []);

  const endRun = useCallback((phase, totalLines, totalPiecesPlaced) => {
    const finalTimeMs = elapsedTimeRef.current;
    runOverRef.current = true;
    clearLockTimer();

    setRunSummary({
      phase,
      linesCleared: totalLines,
      totalPiecesPlaced,
      finalTimeMs,
      pps: calculatePPS(totalPiecesPlaced, finalTimeMs),
    });
    setGamePhase(phase);
  }, [clearLockTimer]);

  const finishRun = useCallback((totalLines, totalPiecesPlaced) => {
    endRun("finished", totalLines, totalPiecesPlaced);
  }, [endRun]);

  const failRun = useCallback((totalLines, totalPiecesPlaced) => {
    endRun("failed", totalLines, totalPiecesPlaced);
  }, [endRun]);

  const startCountdown = useCallback(() => {
    clearLockTimer();
    clearInputState();
    clearCountdownTimers();
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    countdownRunIdRef.current += 1;
    const runId = countdownRunIdRef.current;

    // Reset game state first so countdown always starts from a clean run.
    startNewGame();

    setRunSummary(null);
    setGamePhase("countdown");
    setCountdownLabel(COUNTDOWN_STEPS[0]);

    COUNTDOWN_STEPS.forEach((label, index) => {
      const timeoutId = setTimeout(() => {
        if (countdownRunIdRef.current !== runId) return;
        setCountdownLabel(label);
      }, index * COUNTDOWN_STEP_MS);

      countdownTimersRef.current.push(timeoutId);
    });

    const playTimeoutId = setTimeout(() => {
      if (countdownRunIdRef.current !== runId) return;
      setGamePhase("playing");
      setCountdownLabel(null);
      rootRef.current?.focus();
    }, COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS + COUNTDOWN_GO_DELAY_MS);

    countdownTimersRef.current.push(playTimeoutId);
  }, [clearInputState, clearCountdownTimers, clearLockTimer, startNewGame]);

  const reset = useCallback(() => {
    startCountdown();
  }, [startCountdown]);

  const togglePause = useCallback(() => {
    if (gamePhase === "playing") {
      clearLockTimer();
      clearInputState();
      setGamePhase("paused");
      rootRef.current?.focus();
      return;
    }

    if (gamePhase === "paused") {
      clearInputState();
      setGamePhase("playing");
      rootRef.current?.focus();
    }
  }, [clearInputState, clearLockTimer, gamePhase]);

  const backToMenu = useCallback(() => {
    clearLockTimer();
    clearInputState();
    clearCountdownTimers();
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    setCountdownLabel(null);
    setRunSummary(null);
    setGamePhase("idle");
    onBackToMenu?.();
  }, [clearCountdownTimers, clearInputState, clearLockTimer, onBackToMenu]);

  const handleMainMenuClick = useCallback((e) => {
    e.stopPropagation();
    backToMenu();
  }, [backToMenu]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    startCountdown();
  }, [startCountdown]);

  const lockCurrentPiece = useCallback(() => {
    if (runOverRef.current) return;
    const engine = engineRef.current;
    const levelBeforeLock = levelForLines(engine.getState().lines);

    const result = engine.lock();
    if (!result) return;

    clearLockTimer();
    syncGame();

    if (result.linesCleared > 0) {
      setScore((s) => s + (SCORES[result.linesCleared] || 0) * (levelBeforeLock + 1));
    }

    const { lines, piecesPlaced } = engine.getState();
    if (result.lockOut) {
      failRun(lines, piecesPlaced);
      return;
    }

    if (isSprintMode && lines >= sprintTargetLines) {
      finishRun(lines, piecesPlaced);
      return;
    }

    if (result.blockOut) {
      failRun(lines, piecesPlaced);
    }
  }, [
    clearLockTimer,
    failRun,
    finishRun,
    isSprintMode,
    sprintTargetLines,
    syncGame,
  ]);

  const scheduleLockTimer = useCallback(() => {
    if (lockTimerRef.current !== null) return;

    lockTimerRef.current = setTimeout(() => {
      lockTimerRef.current = null;
      lockCurrentPiece();
    }, LOCK_DELAY_MS);
  }, [lockCurrentPiece]);

  // After a successful move/rotate: grounded pieces restart the lock delay,
  // airborne pieces cancel it.
  const refreshLockTimer = useCallback(() => {
    clearLockTimer();
    if (engineRef.current.isGrounded()) {
      scheduleLockTimer();
    }
  }, [clearLockTimer, scheduleLockTimer]);

  const moveActivePiece = useCallback((dx) => {
    if (!engineRef.current.move(dx, 0)) return;
    refreshLockTimer();
    syncGame();
  }, [refreshLockTimer, syncGame]);

  const rotateActivePiece = useCallback((direction) => {
    const rotated = engineRef.current.rotate(direction, {
      debug: debugRotation,
      onDebug: (info) => {
        if (!debugRotation || typeof console === "undefined") return;

        console.groupCollapsed(
          `[rotation] ${info.pieceType} ${direction.toUpperCase()} ${info.fromRotation}->${info.toRotation} @ (${info.fromX},${info.fromY})`,
        );
        console.log("origin cells:", formatCells(info.originCells));
        console.log("raw rotated offsets:", formatCells(info.rawRotatedOffsets));

        info.attempts.forEach((attempt, idx) => {
          const status = attempt.blocked ? "fail" : "pass";
          const reason = attempt.reason
            ? JSON.stringify(attempt.reason)
            : "none";
          console.log(
            `[kick ${idx + 1}] dx=${attempt.dx}, dy=${attempt.dy} -> ${status}; reason=${reason}; cells=${formatCells(attempt.cells)}`,
          );
        });

        if (info.acceptedKick) {
          console.log(
            `accepted kick: dx=${info.acceptedKick.dx}, dy=${info.acceptedKick.dy}; cells=${formatCells(info.acceptedCells || [])}`,
          );
        } else {
          console.log("rotation failed: no legal kick found");
        }
        console.groupEnd();
      },
    });
    if (!rotated) return;

    refreshLockTimer();
    syncGame();
  }, [debugRotation, refreshLockTimer, syncGame]);

  const hardDropActivePiece = useCallback(() => {
    engineRef.current.dropToFloor();
    lockCurrentPiece();
  }, [lockCurrentPiece]);

  const holdActivePiece = useCallback(() => {
    const engine = engineRef.current;
    if (!engine.hold()) return;

    clearLockTimer();
    syncGame();

    const { toppedOut, lines, piecesPlaced } = engine.getState();
    if (toppedOut) {
      failRun(lines, piecesPlaced);
    }
  }, [clearLockTimer, failRun, syncGame]);

  useEffect(() => {
    if (gamePhase !== "playing") {
      clearLockTimer();
    }
  }, [gamePhase, clearLockTimer]);

  useEffect(() => {
    return () => {
      clearLockTimer();
      clearCountdownTimers();
    };
  }, [clearCountdownTimers, clearLockTimer]);

  const processInputFrame = useCallback((now) => {
    if (lastFrameTimeRef.current === null) {
      lastFrameTimeRef.current = now;
    }

    let deltaMs = now - lastFrameTimeRef.current;
    if (deltaMs < 0) deltaMs = 0;
    if (deltaMs > 100) deltaMs = 100;
    lastFrameTimeRef.current = now;

    if (gamePhase !== "playing" || runOverRef.current) {
      actionQueueRef.current = [];
      gravityAccumulatorRef.current = 0;
      return;
    }

    elapsedTimeRef.current += deltaMs;
    setElapsedTimeMs(elapsedTimeRef.current);

    const actions = actionQueueRef.current;
    actionQueueRef.current = [];
    for (const action of actions) {
      if (runOverRef.current) return;
      if (action === "left") moveActivePiece(-1);
      else if (action === "right") moveActivePiece(1);
      else if (action === "hardDrop") hardDropActivePiece();
      else if (action === "hold") holdActivePiece();
      else if (action === "rotateCW") rotateActivePiece("cw");
      else if (action === "rotateCCW") rotateActivePiece("ccw");
      else if (action === "rotate180") rotateActivePiece("180");
    }
    if (runOverRef.current) return;

    const keyState = keyStateRef.current;
    if (keyState.left && keyState.right) {
      const leftTiming = repeatTimingRef.current.left;
      const rightTiming = repeatTimingRef.current.right;
      const primary = leftTiming.pressedAt >= rightTiming.pressedAt ? "left" : "right";
      const secondary = primary === "left" ? "right" : "left";

      const shouldMovePrimary = pollRepeatControl(primary, now);
      pollRepeatControl(secondary, now, false);

      if (shouldMovePrimary) {
        moveActivePiece(primary === "left" ? -1 : 1);
      }
    } else if (keyState.left) {
      if (pollRepeatControl("left", now)) moveActivePiece(-1);
    } else if (keyState.right) {
      if (pollRepeatControl("right", now)) moveActivePiece(1);
    }

    const engine = engineRef.current;

    if (keyState.softDrop && useInfiniteSoftDrop) {
      if (engine.dropToFloor() > 0) {
        clearLockTimer();
        syncGame();
      }
      scheduleLockTimer();
      gravityAccumulatorRef.current = 0;
      return;
    }

    const gravityStepMs = keyState.softDrop
      ? GRAVITY_FAST
      : gravityForLevel(levelForLines(engine.getState().lines));
    gravityAccumulatorRef.current += deltaMs;

    let fell = false;
    while (gravityAccumulatorRef.current >= gravityStepMs) {
      if (!engine.move(0, 1)) {
        scheduleLockTimer();
        gravityAccumulatorRef.current = 0;
        break;
      }

      clearLockTimer();
      fell = true;
      gravityAccumulatorRef.current -= gravityStepMs;
    }
    if (fell) syncGame();
  }, [
    clearLockTimer,
    gamePhase,
    hardDropActivePiece,
    holdActivePiece,
    moveActivePiece,
    pollRepeatControl,
    rotateActivePiece,
    scheduleLockTimer,
    syncGame,
    useInfiniteSoftDrop,
  ]);

  useEffect(() => {
    if (gamePhase !== "playing") return undefined;

    const step = (now) => {
      processInputFrame(now);
      frameIdRef.current = requestAnimationFrame(step);
    };

    frameIdRef.current = requestAnimationFrame(step);
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [gamePhase, processInputFrame]);

  useEffect(() => {
    return () => {
      clearInputState();
    };
  }, [clearInputState]);

  const onKeyDown = useCallback((e) => {
    const isPauseToggle = e.code === "KeyP" || e.code === "Escape";
    const isReset = e.code === "KeyR";

    if (isReset) {
      e.preventDefault();
      if (e.repeat) return;
      reset();
      return;
    }

    if (isPauseToggle) {
      e.preventDefault();
      if (e.repeat) return;

      togglePause();
      return;
    }

    if (gamePhase !== "playing") return;
    if (!CODE_TO_CONTROLS[e.code]) return;
    e.preventDefault();
    if (e.repeat) return;
    syncControlForCode(e.code, true, performance.now());
  }, [
    gamePhase,
    reset,
    syncControlForCode,
    togglePause,
  ]);

  const onKeyUp = useCallback((e) => {
    if (gamePhase !== "playing") return;
    if (!CODE_TO_CONTROLS[e.code]) return;
    e.preventDefault();
    syncControlForCode(e.code, false, performance.now());
  }, [gamePhase, syncControlForCode]);

  const onInputBlur = useCallback(() => {
    clearInputState();
  }, [clearInputState]);

  const { board, piece, holdType, next: nextQueue, lines, piecesPlaced } = game;
  const level = levelForLines(lines);
  const renderPiece = gamePhase === "playing" || gamePhase === "paused"
    ? piece
    : null;
  const view = renderPiece ? cellsWithCurrentPiece(board, renderPiece) : board;
  const ghostPiece = renderPiece ? getGhostPiece(board, renderPiece) : null;
  const ghostCells = ghostPiece ? getPieceCellSet(ghostPiece) : new Set();
  const ghostFill = renderPiece ? hexToRgba(COLORS[renderPiece.id], 0.18) : "transparent";
  const ghostStroke = renderPiece ? hexToRgba(COLORS[renderPiece.id], 0.65) : "transparent";
  const showPausedOverlay = gamePhase === "paused";
  const showCountdownOverlay = gamePhase === "countdown";
  const showFinishedOverlay = gamePhase === "finished";
  const showFailedOverlay = gamePhase === "failed";
  const finalTime = runSummary?.finalTimeMs ?? elapsedTimeMs;
  const finalPieces = runSummary?.totalPiecesPlaced ?? piecesPlaced;
  const finalLines = runSummary?.linesCleared ?? lines;
  const finalPps = runSummary?.pps ?? calculatePPS(finalPieces, finalTime);
  const nextPreviewQueue = gamePhase === "countdown" && piece
    ? [piece.type, ...nextQueue].slice(0, NEXT_PREVIEW_COUNT)
    : nextQueue;
  const overlayButtonStyle = {
    background: "#20232a",
    color: "#fff",
    border: "1px solid #2f2f36",
    borderRadius: 6,
    padding: "8px 14px",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        outline: "2px solid #2f2f36",
        padding: 12,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: "#0d0d12",
        borderRadius: 10,
        userSelect: "none",
      }}
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onInputBlur}
      aria-label="Tetris game board"
      role="application"
    >
      <div
        style={{
          width: 132,
          display: "grid",
          gap: 10,
          color: "#d0d2e6",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
        }}
      >
        <div
          style={{
            border: "1px solid #2f2f36",
            borderRadius: 8,
            background: "#12131a",
            padding: 8,
          }}
        >
          <div style={{ marginBottom: 6, color: "#9ea2be" }}>HOLD (C)</div>
          {renderMiniPiece(holdType)}
        </div>

        <div
          style={{
            border: "1px solid #2f2f36",
            borderRadius: 8,
            background: "#12131a",
            padding: 8,
            lineHeight: 1.4,
          }}
        >
          <div style={{ color: "#9ea2be", marginBottom: 4 }}>CONTROLS</div>
          <div>Move: Arrows</div>
          <div>Hard Drop: Space</div>
          <div>Rotate CW: Up / X</div>
          <div>Rotate CCW: Z</div>
          <div>Rotate 180: A</div>
          <div>Hold: C</div>
          <div>Pause: P / Esc</div>
          <div>Reset: R</div>
        </div>

        {allowManualReset && (
          <button
            onClick={reset}
            style={{
              padding: "7px 12px",
              background: "#20232a",
              color: "#fff",
              border: "1px solid #2f2f36",
              borderRadius: 6,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Reset
          </button>
        )}

        <button
          onClick={togglePause}
          disabled={gamePhase !== "playing" && gamePhase !== "paused"}
          style={{
            padding: "7px 12px",
            background:
              gamePhase === "playing" || gamePhase === "paused"
                ? "#20232a"
                : "#161820",
            color: "#fff",
            border: "1px solid #2f2f36",
            borderRadius: 6,
            cursor:
              gamePhase === "playing" || gamePhase === "paused"
                ? "pointer"
                : "not-allowed",
            width: "100%",
            opacity: gamePhase === "playing" || gamePhase === "paused" ? 1 : 0.6,
          }}
        >
          {gamePhase === "paused" ? "Resume" : "Pause"}
        </button>

        <button
          onClick={() => setUseInfiniteSoftDrop((prev) => !prev)}
          style={{
            padding: "7px 12px",
            background: useInfiniteSoftDrop ? "#1f4f6b" : "#20232a",
            color: "#fff",
            border: "1px solid #2f2f36",
            borderRadius: 6,
            cursor: "pointer",
            width: "100%",
            fontSize: 11,
          }}
          title="Toggle soft drop speed"
        >
          Soft Drop: {useInfiniteSoftDrop ? "Infinite" : "Default"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#cfcfe1",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 14,
          }}
        >
          {isSprintMode ? (
            <>
              <div>Time: {formatDuration(elapsedTimeMs)}</div>
              <div>Lines: {lines}/{sprintTargetLines}</div>
              <div>Pieces: {piecesPlaced}</div>
            </>
          ) : (
            <>
              <div>Score: {score}</div>
              <div>Lines: {lines}</div>
              <div>Level: {level}</div>
            </>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${CELL_SIZE}px)`,
            gap: 1,
            background: "#22232b",
            border: "1px solid #2f2f36",
            position: "relative",
          }}
          onClick={() => rootRef.current?.focus()}
          title="Click to focus, then use Arrows + Space + C"
        >
          {view.map((row, y) =>
            row.map((cell, x) => {
              const filled = cell !== 0;
              const isGhost = !filled && ghostCells.has(`${x},${y}`);
              return (
                <div
                  key={`${y}-${x}`}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    background: filled ? COLORS[cell] : isGhost ? ghostFill : COLORS[0],
                    borderRadius: 3,
                    boxShadow: filled ? "inset 0 0 3px rgba(0,0,0,0.5)" : "none",
                    border: isGhost ? `1px dashed ${ghostStroke}` : "none",
                  }}
                />
              );
            }),
          )}

          {showPausedOverlay && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.62)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                textAlign: "center",
                padding: 12,
                zIndex: 20,
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 24 }}>Paused</div>
                <div style={{ color: "#d3d6e4" }}>Press P or Esc to resume</div>
                <div>
                  <button onClick={handleMainMenuClick} style={overlayButtonStyle}>
                    Main Menu
                  </button>
                </div>
              </div>
            </div>
          )}

          {showCountdownOverlay && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 34,
                letterSpacing: 1,
              }}
            >
              {countdownLabel}
            </div>
          )}

          {showFinishedOverlay && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.68)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                textAlign: "center",
                padding: 12,
                zIndex: 20,
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 24 }}>Complete</div>
                <div>Time: {formatDuration(finalTime)}</div>
                <div>PPS: {finalPps.toFixed(2)}</div>
                <div>Pieces placed: {finalPieces}</div>
                <div style={{ color: "#d3d6e4", marginTop: 4 }}>Press R to retry</div>
                <div>
                  <button onClick={handleMainMenuClick} style={overlayButtonStyle}>
                    Main Menu
                  </button>
                </div>
              </div>
            </div>
          )}

          {showFailedOverlay && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.72)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                textAlign: "center",
                padding: 12,
                zIndex: 20,
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 24 }}>Game Over</div>
                <div>Time: {formatDuration(finalTime)}</div>
                <div>PPS: {finalPps.toFixed(2)}</div>
                <div>Pieces placed: {finalPieces}</div>
                <div>Lines cleared: {finalLines}</div>
                <div style={{ color: "#d3d6e4", marginTop: 4 }}>Press R to retry</div>
                <div>
                  <button onClick={handleMainMenuClick} style={overlayButtonStyle}>
                    Main Menu
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          width: 132,
          display: "grid",
          gap: 8,
          color: "#d0d2e6",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
        }}
      >
        <div style={{ color: "#9ea2be" }}>NEXT</div>
        {Array.from({ length: NEXT_PREVIEW_COUNT }, (_, index) => (
          <div
            key={`next-${index}`}
            style={{
              border: "1px solid #2f2f36",
              borderRadius: 8,
              background: "#12131a",
              padding: 6,
              minHeight: 62,
              display: "grid",
              placeItems: "center",
            }}
          >
            {renderMiniPiece(nextPreviewQueue[index] ?? null)}
          </div>
        ))}
      </div>
    </div>
  );
}