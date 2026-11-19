import { createSeededRandom } from "../game/pieces.js";
import { findPath, spinOfRotation, toRows } from "./movegen.js";
import { planMove } from "./search.js";

// Frames past the piece deadline to wait for the planner before falling back.
const PLAN_GRACE_FRAMES = 30;
// Inputs per piece before the bot gives up on its path and hard drops.
const MAX_ACTIONS_PER_PIECE = 40;

function pieceOf(s) {
  const { type, x, y, rot } = s.piece;
  return { type, x, y, rot, spin: spinOfRotation(s.lastRotation) };
}

export function snapshotOf(engine) {
  const s = engine.getState();
  return {
    rows: toRows(s.board),
    piece: pieceOf(s),
    hold: s.holdType,
    canHold: s.canHold,
    queue: s.next,
    combo: s.combo,
    b2b: s.b2b,
    incoming: engine.pendingGarbage(),
    rules: engine.rules,
  };
}

// Cheap sync decision used when the planner is late or the plan went stale.
function fallbackPlan(engine, profile, allowHold) {
  const snapshot = snapshotOf(engine);
  if (!allowHold) snapshot.canHold = false;
  return planMove(
    snapshot,
    { ...profile, depth: 1, beam: 1, noise: 0, mistakeRate: 0 },
    { maxNodes: 200 },
  );
}

// Drives one engine through engine.apply(), like a player's keyboard.
// Call update(engine) once per frame before the match steps.
export function createBot({ profile, seed = "bot", planner }) {
  const speedRandom = createSeededRandom(`${seed}:speed`);
  const phase1 = speedRandom() * Math.PI * 2;
  const phase2 = speedRandom() * Math.PI * 2;

  let frame = 0;
  let decision = 0;
  let placed = -1;
  let pieceStart = 0;
  let interval = 60;
  let plan = null;
  let held = false;
  let nextActionFrame = 0;
  let paused = false;
  let path = null;
  let pathFor = "";
  let requestedAt = 0;
  let actions = 0;
  const stats = {
    decisions: 0,
    fallbacks: 0,
    stale: 0,
    thinkMs: 0,
    avgThinkMs: 0,
    maxThinkMs: 0,
    targetPps: 0,
    lastPlan: null,
  };

  // Smooth speed drift between the profile's min and max PPS.
  function ppsAt(f) {
    const [lo, hi] = profile.pps;
    const t = f / 60;
    const v = 0.6 * Math.sin((2 * Math.PI * t) / 23 + phase1) + 0.4 * Math.sin((2 * Math.PI * t) / 9 + phase2);
    return lo + ((hi - lo) * (v + 1)) / 2;
  }

  function startPiece(engine, state) {
    placed = state.piecesPlaced;
    pieceStart = frame;
    stats.targetPps = ppsAt(frame);
    interval = Math.max(1, Math.round(60 / stats.targetPps));
    plan = null;
    held = false;
    actions = 0;
    path = null;
    nextActionFrame = frame + profile.reactionFrames;
    decision += 1;
    const token = decision;
    requestedAt = frame;
    planner.request({ snapshot: snapshotOf(engine), profileId: profile.id, profile, seed: `${seed}:${token}` }, (res, ms) => {
      if (token !== decision) return; // piece already gone
      accept(res, ms);
    });
  }

  function accept(res, ms = 0) {
    plan = res;
    stats.decisions += 1;
    stats.thinkMs = ms;
    stats.maxThinkMs = Math.max(stats.maxThinkMs, ms);
    stats.avgThinkMs += (ms - stats.avgThinkMs) / stats.decisions;
    stats.lastPlan = res && { ...res, decidedAfterFrames: frame - requestedAt };
  }

  function act(engine, action, applied) {
    actions += 1;
    engine.apply(action);
    applied.push(action);
  }

  function currentPath(engine) {
    const s = engine.getState();
    const piece = pieceOf(s);
    const key = `${piece.type}${piece.x},${piece.y},${piece.rot},${piece.spin}`;
    if (key !== pathFor || !path) {
      pathFor = key;
      path = plan ? findPath(toRows(s.board), piece, plan.target, { useDas: profile.useDas }) : null;
      if (!path) {
        // Gravity or a desync made the target unreachable: re-decide now, without hold.
        stats.stale += 1;
        plan = fallbackPlan(engine, profile, false);
        path = plan ? findPath(toRows(s.board), piece, plan.target, { useDas: true }) : null;
        path ??= ["hardDrop"];
      }
    }
    return path;
  }

  function update(engine) {
    const applied = [];
    if (paused) return applied;
    const state = engine.getState();
    if (state.toppedOut) return applied;
    frame += 1;
    if (state.piecesPlaced !== placed) startPiece(engine, state);

    const elapsed = frame - pieceStart;
    if (!plan) {
      if (elapsed < interval + PLAN_GRACE_FRAMES) return applied;
      stats.fallbacks += 1;
      decision += 1; // ignore the late answer
      accept(fallbackPlan(engine, profile, state.canHold), 0);
      if (!plan) {
        act(engine, "hardDrop", applied);
        return applied;
      }
    }
    if (frame < nextActionFrame) return applied;

    if (plan.useHold && !held) {
      held = true;
      if (state.canHold) {
        act(engine, "hold", applied);
        nextActionFrame = frame + profile.tapFrames;
        if (profile.movement === "human") return applied;
      }
    }

    const steps = actions >= MAX_ACTIONS_PER_PIECE ? ["hardDrop"] : currentPath(engine);
    const lockSoon = engine.isGrounded() && engine.getState().lockFrames >= engine.rules.lockDelay - 4;
    if (profile.movement === "fast" || lockSoon) {
      if (elapsed < interval && !lockSoon) return applied;
      for (const action of steps) act(engine, action, applied);
      path = null;
      return applied;
    }

    // Human: inputs spread over the piece interval (never faster than tapFrames),
    // so the drop lands near the deadline instead of auto-locking early.
    if (steps.length > 1) {
      act(engine, steps.shift(), applied);
      pathFor = "";
      const spread = Math.floor((pieceStart + interval - frame) / (steps.length + 1));
      nextActionFrame = frame + Math.max(profile.tapFrames, spread);
    } else if (elapsed >= interval) {
      act(engine, "hardDrop", applied);
      path = null;
    }
    return applied;
  }

  return {
    profile,
    update,
    stats,
    setPaused(value) {
      paused = value;
    },
    getFrame: () => frame,
  };
}
