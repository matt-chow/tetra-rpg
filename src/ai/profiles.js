// AI opponents are pure config: search effort, evaluation weights, mistakes,
// speed and movement style. Add an entry here to add an opponent.
//
// search:   depth (pieces placed in lookahead), beam (nodes kept per level),
//           nodes (placement budget per decision)
// quality:  noise (random eval jitter), mistakeRate (chance to take a lesser move)
// style:    aggression scales attack/T-spin/B2B rewards vs. safe stacking
// speed:    pps [min, max] with smooth drift; movement "human" (timed taps) or "fast"
const BASE_WEIGHTS = {
  holes: -6,
  covered: -0.9,
  bumpiness: -0.45,
  bumpSq: -0.08,
  rowTransitions: -0.35,
  height: -0.1,
  well: 0.5,
  tslot: 16,
  danger: -1.2,
  // rewards for what a placement did
  attack: 3,
  burn: -3.5, // a clear that sends nothing
  b2bKeep: 6,
  b2bBreak: -4,
  wasteT: -5,
  perfectClear: 30,
  combo: 0.6,
};

export const AI_PROFILES = {
  apprentice: {
    id: "apprentice",
    name: "Apprentice",
    blurb: "Stacks cleanly, clears what it sees. Slow and a little sloppy.",
    pps: [0.4, 0.8],
    movement: "human",
    tapFrames: 8,
    reactionFrames: 16,
    useDas: false,
    depth: 1,
    beam: 1,
    nodes: 400,
    aggression: 0.15,
    tspins: false,
    noise: 1.5,
    mistakeRate: 0.15,
  },
  expert: {
    id: "expert",
    name: "Expert",
    blurb: "Builds for quads, punishes messy boards.",
    pps: [0.9, 1.5],
    movement: "human",
    tapFrames: 4,
    reactionFrames: 8,
    useDas: true,
    depth: 2,
    beam: 8,
    nodes: 2500,
    aggression: 0.5,
    tspins: true,
    noise: 0.6,
    mistakeRate: 0.04,
  },
  master: {
    id: "master",
    name: "Master",
    blurb: "T-spins, back-to-back and fast hands.",
    pps: [1.7, 2.5],
    movement: "fast",
    tapFrames: 1,
    reactionFrames: 2,
    useDas: true,
    depth: 3,
    beam: 16,
    nodes: 9000,
    aggression: 0.85,
    tspins: true,
    noise: 0.1,
    mistakeRate: 0.01,
  },
  legendary: {
    id: "legendary",
    name: "Legendary",
    blurb: "Relentless. Plans several pieces ahead at four pieces a second.",
    pps: [2.8, 4.0],
    movement: "fast",
    tapFrames: 0,
    reactionFrames: 0,
    useDas: true,
    depth: 4,
    beam: 24,
    nodes: 20000,
    aggression: 1,
    tspins: true,
    noise: 0,
    mistakeRate: 0,
  },
};

export const AI_PROFILE_ORDER = ["apprentice", "expert", "master", "legendary"];

// Evaluation weights for a profile; aggression trades attack rewards against safety.
// Base values were tuned at aggression 1 with scripts/bench-ai.js.
export function weightsFor(profile) {
  const a = profile.aggression;
  return {
    ...BASE_WEIGHTS,
    attack: BASE_WEIGHTS.attack * (0.3 + a),
    burn: BASE_WEIGHTS.burn * a,
    b2bKeep: BASE_WEIGHTS.b2bKeep * a,
    b2bBreak: BASE_WEIGHTS.b2bBreak * a,
    well: BASE_WEIGHTS.well * (0.4 + a),
    tslot: profile.tspins ? BASE_WEIGHTS.tslot * a : 0,
    wasteT: profile.tspins ? BASE_WEIGHTS.wasteT * a : 0,
    ...profile.weights,
  };
}

export function getProfile(id) {
  const profile = AI_PROFILES[id];
  if (!profile) throw new Error(`Unknown AI profile: ${id}`);
  return profile;
}
