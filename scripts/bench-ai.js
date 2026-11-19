// Headless AI benchmark: decision cost, solo survival/attack and tier-vs-tier duels.
// Usage: npm run bench:ai [-- --pieces 300 --matches 4]
import { createMatch } from "../src/game/match.js";
import { createBot } from "../src/ai/bot.js";
import { createSyncPlanner } from "../src/ai/planner.js";
import { AI_PROFILES, AI_PROFILE_ORDER } from "../src/ai/profiles.js";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [])),
);
const PIECES = Number(args.pieces ?? 200);
const MATCHES = Number(args.matches ?? 3);
const MAX_FRAMES = 60 * 60 * 6;

function solo(profileId, seed) {
  const match = createMatch({ seed, players: 1, trainer: { interval: 240, min: 1, max: 3 } });
  const bot = createBot({ profile: AI_PROFILES[profileId], seed, planner: createSyncPlanner() });
  const engine = match.players[0];
  while (!match.getResult() && engine.getState().piecesPlaced < PIECES && match.getFrame() < MAX_FRAMES) {
    bot.update(engine);
    match.step();
  }
  const s = engine.getState();
  return {
    pieces: s.piecesPlaced,
    pps: s.piecesPlaced / (match.getFrame() / 60),
    app: s.stats.attack / Math.max(1, s.piecesPlaced),
    toppedOut: s.toppedOut,
    tspins: s.stats.tspins,
    quads: s.stats.quads,
    avgMs: bot.stats.avgThinkMs,
    maxMs: bot.stats.maxThinkMs,
    fallbacks: bot.stats.fallbacks,
    stale: bot.stats.stale,
  };
}

function duel(a, b, seed) {
  const match = createMatch({ seed });
  const bots = [a, b].map((id, i) =>
    createBot({ profile: AI_PROFILES[id], seed: `${seed}:${i}`, planner: createSyncPlanner() }),
  );
  while (!match.getResult() && match.getFrame() < MAX_FRAMES) {
    bots.forEach((bot, i) => bot.update(match.players[i]));
    match.step();
  }
  return { result: match.getResult(), seconds: match.getFrame() / 60 };
}

const fmt = (n, d = 2) => n.toFixed(d);
console.log(`Solo (${PIECES} pieces, trainer garbage 1-3 every 4s)`);
console.log("profile     pps   app   tspins quads topout  avgMs  maxMs fallbacks stale");
for (const id of AI_PROFILE_ORDER) {
  const r = solo(id, `bench-${id}`);
  console.log(
    `${id.padEnd(11)} ${fmt(r.pps)}  ${fmt(r.app)}  ${String(r.tspins).padStart(6)} ${String(r.quads).padStart(5)} ${String(r.toppedOut).padStart(6)}  ${fmt(r.avgMs, 1).padStart(5)}  ${fmt(r.maxMs, 1).padStart(5)} ${String(r.fallbacks).padStart(9)} ${String(r.stale).padStart(5)}`,
  );
}

console.log(`\nDuels (${MATCHES} per pairing, higher tier listed first)`);
for (let i = AI_PROFILE_ORDER.length - 1; i > 0; i--) {
  const hi = AI_PROFILE_ORDER[i];
  const lo = AI_PROFILE_ORDER[i - 1];
  let wins = 0;
  let total = 0;
  for (let m = 0; m < MATCHES; m++) {
    const { result, seconds } = duel(hi, lo, `duel-${hi}-${lo}-${m}`);
    if (result?.winner === 0) wins += 1;
    total += seconds;
  }
  console.log(`${hi} vs ${lo}: ${wins}/${MATCHES} wins, avg ${fmt(total / MATCHES, 0)}s`);
}
