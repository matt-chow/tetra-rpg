import { createPieceByType, createSeededRandom } from "../game/pieces.js";
import { computeAttack, isDifficultClear } from "../game/attack.js";
import { generatePlacements, place, tspinOf } from "./movegen.js";
import { evaluateBoard } from "./evaluate.js";
import { weightsFor } from "./profiles.js";

// Snapshot of what a player can see, the only input to the planner:
// { rows, piece: {type,x,y,rot}, hold, canHold, queue, combo, b2b, incoming, rules }

function spawnOf(type) {
  const p = createPieceByType(type);
  return { type, x: p.x, y: p.y, rot: 0 };
}

// Reward for what one placement did, before the static board evaluation.
function placementReward(w, outcome, before) {
  const { lines, attack, tspin, perfectClear, combo, b2b } = outcome;
  let r = w.attack * attack;
  if (lines > 0 && attack === 0) r += w.burn * lines;
  if (lines > 0 && isDifficultClear(lines, tspin)) r += w.b2bKeep;
  if (lines > 0 && before.b2b >= 0 && b2b < 0) r += w.b2bBreak;
  if (outcome.type === "T" && tspin === "none") r += w.wasteT;
  if (perfectClear) r += w.perfectClear;
  if (combo > 0) r += w.combo * combo;
  return r;
}

// Expands one node with every placement of the current piece, plus the hold option.
function expand(node, snapshot, w, rules, isRoot) {
  const options = [{ type: node.cur, hold: node.hold, qi: node.qi, used: false }];
  if (!isRoot || snapshot.canHold) {
    if (node.hold === null) {
      if (node.qi < snapshot.queue.length) {
        options.push({ type: snapshot.queue[node.qi], hold: node.cur, qi: node.qi + 1, used: true });
      }
    } else if (node.hold !== node.cur) {
      options.push({ type: node.hold, hold: node.cur, qi: node.qi, used: true });
    }
  }

  const children = [];
  for (const opt of options) {
    const start = isRoot && !opt.used ? snapshot.piece : spawnOf(opt.type);
    for (const p of generatePlacements(node.rows, start)) {
      const tspin = tspinOf(node.rows, p);
      const placed = place(node.rows, p);
      if (placed.lockOut) continue;
      const combo = placed.lines > 0 ? node.combo + 1 : -1;
      const b2b = placed.lines > 0 ? (isDifficultClear(placed.lines, tspin) ? node.b2b + 1 : -1) : node.b2b;
      const attack = computeAttack(
        { lines: placed.lines, tspin, combo, b2b, perfectClear: placed.perfectClear },
        rules,
      );
      const outcome = { type: p.type, lines: placed.lines, attack, tspin, perfectClear: placed.perfectClear, combo, b2b };
      const incoming = Math.max(0, node.incoming - attack);
      children.push({
        rows: placed.rows,
        cur: snapshot.queue[opt.qi] ?? null,
        hold: opt.hold,
        qi: opt.qi + 1,
        combo,
        b2b,
        incoming,
        reward: node.reward + placementReward(w, outcome, node),
        first: node.first ?? { useHold: opt.used, target: p, outcome },
      });
    }
  }
  return children;
}

// Beam search with hold over the visible queue. Deterministic for a given
// snapshot, profile and rng: the effort limit is a node count, not wall time.
export function planMove(snapshot, profile, { random = Math.random, maxNodes = profile.nodes } = {}) {
  const w = weightsFor(profile);
  const rules = snapshot.rules ?? {};
  const root = {
    rows: snapshot.rows,
    cur: snapshot.piece.type,
    hold: snapshot.hold ?? null,
    qi: 0,
    combo: snapshot.combo ?? -1,
    b2b: snapshot.b2b ?? -1,
    incoming: snapshot.incoming ?? 0,
    reward: 0,
    first: null,
  };

  let beam = [root];
  let nodes = 0;
  let depthReached = 0;
  let rootChildren = null;
  for (let depth = 0; depth < profile.depth; depth++) {
    const children = [];
    for (const node of beam) {
      if (node.cur === null) continue;
      const kids = expand(node, snapshot, w, rules, depth === 0);
      for (const kid of kids) {
        kid.score = kid.reward + evaluateBoard(kid.rows, w, kid.incoming).score;
        if (depth === 0 && profile.noise) kid.score += (random() - 0.5) * 2 * profile.noise;
      }
      nodes += kids.length;
      children.push(...kids);
      if (depth > 0 && nodes >= maxNodes) break;
    }
    if (children.length === 0) break;
    children.sort((a, b) => b.score - a.score);
    if (depth === 0) rootChildren = children;
    beam = children.slice(0, profile.beam);
    depthReached = depth + 1;
    if (nodes >= maxNodes) break;
  }

  if (!rootChildren) return null; // no legal placement without locking out

  // Rank first moves by the best line found under them.
  const byFirst = new Map();
  for (const node of depthReached > 1 ? beam : rootChildren) {
    const key = node.first.target.key + node.first.useHold;
    if (!byFirst.has(key) || byFirst.get(key).score < node.score) byFirst.set(key, node);
  }
  const ranked = [...byFirst.values()].sort((a, b) => b.score - a.score);
  if (profile.mistakeRate && random() < profile.mistakeRate) {
    // A lesser but still plausible move: one of the next few root options.
    const alt = rootChildren.slice(1, 6);
    if (alt.length) {
      const chosen = alt[Math.floor(random() * alt.length)];
      return result(chosen, ranked, nodes, depthReached, true);
    }
  }
  return result(ranked[0], ranked, nodes, depthReached, false);
}

function result(node, ranked, nodes, depth, mistake) {
  return {
    useHold: node.first.useHold,
    target: node.first.target,
    outcome: node.first.outcome,
    score: node.score,
    nodes,
    depth,
    mistake,
    candidates: ranked.slice(0, 5).map((n) => ({ target: n.first.target, useHold: n.first.useHold, score: n.score })),
  };
}

export function createPlannerRandom(seed) {
  return createSeededRandom(`${seed}:ai`);
}
