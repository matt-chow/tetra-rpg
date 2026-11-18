import { createGame } from "./engine.js";
import { createSeededRandom } from "./pieces.js";

// Owns one engine per player and routes attacks between them on a fixed frame
// clock. Inputs go straight to `match.players[i].apply()` before `step()`.
//
// options:
//   players   number of boards (1 = solo, 2 = duel)
//   rules     engine rule overrides shared by every board (per-player via playerRules)
//   trainer   { interval, min, max } frames between and size range of practice garbage
//   goalLines solo goal (e.g. 40 for sprint); reaching it finishes the match
//   initialBoards optional starting board per player (tests, future encounters)
export function createMatch({
  seed = "match",
  players = 2,
  rules,
  playerRules = [],
  trainer = null,
  goalLines = null,
  initialBoards = [],
} = {}) {
  const engines = Array.from({ length: players }, (_, i) =>
    createGame({
      seed: `${seed}:p${i}`,
      rules: { ...rules, ...playerRules[i] },
      initialBoard: initialBoards[i],
    }),
  );
  const trainerRandom = createSeededRandom(`${seed}:trainer`);
  let trainerTimer = trainer?.interval ?? 0;
  let frame = 0;
  let result = null; // { winner: index | null, reason, frame }

  function finish(winner, reason) {
    result = { winner, reason, frame };
  }

  // Drains engine events, forwards sent garbage and returns [{ player, ...event }].
  function collect() {
    const out = [];
    engines.forEach((engine, player) => {
      for (const event of engine.drainEvents()) {
        out.push({ player, ...event });
        if (event.kind === "lock" && event.sent > 0 && players > 1) {
          const target = engines[(player + 1) % players];
          target.receiveAttack(event.sent);
        }
      }
    });
    return out;
  }

  function checkEnd() {
    if (result) return;
    const out = engines.map((e) => e.getState().toppedOut);
    if (players === 1) {
      if (out[0]) finish(null, "topOut");
      else if (goalLines && engines[0].getState().lines >= goalLines) finish(0, "goal");
      return;
    }
    const alive = out.flatMap((dead, i) => (dead ? [] : [i]));
    if (alive.length === 0) finish(null, "draw");
    else if (alive.length === 1) finish(alive[0], "topOut");
  }

  function step() {
    if (result) return { events: [], result };
    // Events from inputs applied since the last step are routed before ticking.
    const events = collect();
    checkEnd();
    if (!result) {
      frame += 1;
      for (const engine of engines) engine.tick();
      if (trainer && --trainerTimer <= 0) {
        trainerTimer = trainer.interval;
        const span = trainer.max - trainer.min + 1;
        engines[0].receiveAttack(trainer.min + Math.floor(trainerRandom() * span));
      }
      events.push(...collect());
      checkEnd();
    }
    return { events, result };
  }

  return {
    players: engines,
    seed,
    step,
    getFrame: () => frame,
    getResult: () => result,
  };
}
