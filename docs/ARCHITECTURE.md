# Architecture

## Layers
```
src/ui (React, canvas)              src/input, src/ai              src/game (pure JS, no time/DOM)
──────────────────────────          ─────────────────────          ─────────────────────────────────
App.jsx  screen flow                controller.js  DAS/ARR/SDF ─▶  engine.js   createGame()
MatchView.jsx                       bot.js  paces + paths ──────▶    apply(action) / tick()
  rAF → fixed 60 Hz frames ──────▶  planner.js ⇄ worker.js           receiveAttack / drainEvents
  draw from engine.getState()         search.js  beam search       match.js    createMatch(): N engines,
DevOverlay.jsx (Shift+`)              evaluate.js / movegen.js                 attack routing, trainer, result
SettingsScreen.jsx ─ settings.js                                   attack.js   S1 attack table, T-spin
```

Everything that decides a game lives in `src/game` and runs on a frame counter, so the same seed and the same `[frame, action]` inputs replay identically in the browser, in Node tests and in the benchmark.

## Engine (`src/game/engine.js`)
`createGame({ seed, random, garbageRandom, previewCount, rules, initialBoard })` owns the board (10×40, rows 0–19 are a hidden buffer), the active piece, queue, hold, gravity, lock delay, combo, B2B, the incoming garbage queue and top-out.

- **Input:** `apply(action)` with `left | right | dasLeft | dasRight | down | sonicDrop | cw | ccw | 180 | hold | hardDrop`, plus `setSoftDrop(active, factor)`. The engine never sees keys or milliseconds.
- **Time:** `tick()` advances one frame (1/60 s): gravity accumulator, lock delay (30 frames, 15 resets, refreshed on a new lowest row) and garbage travel countdown.
- **Lock:** `lock()` clears lines, classifies T-spins (3-corner, mini, TST-kick upgrade), computes combo, B2B and attack, cancels incoming garbage with outgoing attack, inserts ready garbage (capped at 8 per piece, none on a clearing lock) and spawns the next piece. It returns the full clear result and pushes a `lock` event.
- **Events:** `drainEvents()` returns `spawn`, `hold`, `lock`, `garbageQueued` and `topOut` in order. UI effects (sounds, popups, attack projectiles) are driven only by these.
- **Rules:** `DEFAULT_RULES` in `constants.js` (gravity, softDropBase, lockDelay, lockResets, garbageCap, garbageTravel, garbageMultiplier, perfectClearBonus). Each engine takes overrides via `rules`, which is the hook for hero traits and boss modifiers.

### Randomizer, queue and hold
- `createBagRNG` shuffles a fresh copy of the 7 pieces (Fisher–Yates) when the bag is empty. Seeds use an integer mulberry32-style PRNG, so Node and browsers agree.
- The queue is topped up only in `takeNextType()`. The first hold of a piece takes one queued piece. A swap with a filled hold takes none. One hold per piece until it locks.
- Garbage holes use their own PRNG stream (`${seed}:garbage`), so received attacks never shift the piece sequence.

### Top-out
- *Block out*: the next piece cannot spawn.
- *Lock out*: a piece locks entirely inside the hidden buffer.
- *Garbage out*: inserted garbage pushes blocks out of the 40-row field.

## Match (`src/game/match.js`)
`createMatch({ seed, players, rules, playerRules, trainer, goalLines, initialBoards })` creates one engine per player with independent seeds (`${seed}:p${i}`). Inputs go to `match.players[i]` first, then `step()`:
1. drains events and routes each lock's `sent` to the opponent's `receiveAttack` (20-frame travel);
2. ticks every engine;
3. runs the practice garbage trainer;
4. drains again and checks the end: last player standing (duel), top-out (solo) or `goalLines` (sprint).

## AI (`src/ai`)
- `movegen.js`: a bitboard copy of the field, BFS over `(x, y, rot, spin)` using the engine's own kick tables, and `findPath()` to turn a target into engine actions. Placements are deduplicated by cell signature (plus spin for T).
- `evaluate.js`: board features (holes, covered cells, bumpiness, wells, row transitions, T-slot quality, danger) and a weighted score.
- `search.js`: `planMove(snapshot, profile)`, a beam search over the current and held piece, `depth` pieces deep, scoring attack, B2B, combo, perfect clears and the resulting board. Seeded noise and occasional mistakes make weaker profiles human.
- `profiles.js`: the four opponents are data (`pps`, `movement`, `tapFrames`, `reactionFrames`, `useDas`, `depth`, `beam`, `maxNodes`, `aggression`, `tspins`, `noise`, `mistakeRate`, `weights`). A new opponent or a boss is a new entry.
- `bot.js`: `createBot({ profile, seed, planner })` requests a plan when a piece spawns, paces itself to a PPS that drifts smoothly within the profile's range, and replays the path through `engine.apply()` like a keyboard. Human profiles spread single taps across the piece interval. Fast profiles act in one burst. If a plan is late (past the deadline plus 30 frames) or stale (gravity moved the piece away from the target), it falls back to a depth-1 synchronous search. A 40-action cap per piece guarantees progress.
- `planner.js` / `worker.js`: `createWorkerPlanner()` runs searches in a Web Worker and falls back to the in-thread planner if the worker fails. Tests and `scripts/bench-ai.js` use `createSyncPlanner()`.

## UI (`src/ui`)
- `App.jsx`: screen flow `menu → select → battle`, `menu → practiceSetup → practice`, `menu → sprint`, `settings`. Future campaign, hero-select and encounter screens slot in as more screens that end in a `MatchView` with rules and profiles.
- `MatchView.jsx`: owns one run. A `requestAnimationFrame` loop converts wall time into fixed 60 Hz frames (capped at 8 per animation frame, so a sleeping tab does not fast-forward). Each frame advances the intro and the 3-2-1 countdown, or calls `controller.update` → `bot.update` → `match.step()`. The canvas is drawn straight from `engine.getState()`; React state only holds the screen phase, results and a ~10 Hz HUD.
- `input/controller.js`: keydown/keyup are queued and replayed in order on the next frame. DAS/ARR are counted in frame time. ARR 0 maps to `dasLeft/dasRight`, and SDF ≥ 41 means instant soft drop.
- `settings.js`: controls, handling, audio and graphics, merged over defaults and stored in `localStorage` (failures fall back to defaults).
- `DevOverlay.jsx`: seed, frame, queues, garbage, lock state, AI target/actual PPS, think time, fallbacks, last plan, eval and candidates (also outlined on the AI board). It can freeze, step a frame, step to the next AI decision and restart with a fixed seed.

## Extension points (not implemented)
- **Traits, hero abilities, boss modifiers:** per-player `rules` overrides (`playerRules` in `createMatch`), plus subscribing to engine events (`lock` carries lines, T-spin, combo, B2B and attack). Board effects can use `receiveAttack` or a future `engine.applyEffect` so they stay deterministic.
- **Encounters/campaign:** an encounter = `{ profile, rules, playerRules, initialBoards, script }` fed to `createMatch` and `createBot`.
- **Multiplayer:** every board is already seed + input driven on a frame clock. What's missing is an input log (`[frame, action]` around `engine.apply`), `serialize()/hash()` for resync, and a transport. See AUDIT.
