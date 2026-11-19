# AGENTS.md

Guidance for coding agents and contributors. Architecture details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Known issues: [docs/AUDIT.md](docs/AUDIT.md).

## Commands
- Install: `npm install`
- Dev server: `npm run dev` (append `?seed=<text>` for a fixed match seed; Shift+` in a game opens the dev overlay)
- Tests once: `npm run test:run` (Vitest)
- Lint: `npm run lint`
- Build: `npm run build`
- AI benchmark: `npm run bench:ai` (`--pieces N --matches N`); rerun after changing `src/ai` weights or profiles

Run tests, lint and build before finishing any change.

## Layout
- `src/game/*.js`: pure gameplay logic, no React, no timers, no DOM, on a 60 Hz frame clock.
  - `engine.js`: `createGame()`, the single source of truth for board, active piece, queue, hold, gravity, lock delay, clears, attack, garbage and top-out. Driven by `apply(action)`, `setSoftDrop()` and `tick()`; reports through `drainEvents()`.
  - `match.js`: `createMatch()`, N engines, attack routing, garbage trainer and win/lose.
  - `attack.js`: S1 attack table, combo/B2B, T-spin classification (shared with the AI).
  - `pieces.js`: piece spawning and the 7-bag randomizer (`createBagRNG`, seedable or injectable `random`).
  - `rotation.js`: SRS rotation + kicks (TETR.IO SRS+ 180 kicks by default). See [docs/rotation-audit.md](docs/rotation-audit.md).
  - `rotationHarness.js`: kick conformance harness used by tests.
  - `board.js`, `constants.js` (`DEFAULT_RULES`), `sprint.js`: helpers and tuning.
- `src/ai/`: bots. `profiles.js` (config-driven opponents), `search.js` (beam search), `evaluate.js`, `movegen.js` (bitboard BFS + paths), `bot.js` (pacing, fallbacks), `planner.js`/`worker.js` (Web Worker with sync fallback).
- `src/input/controller.js`: DAS/ARR/SDF in frame time, fed by queued key events.
- `src/settings.js`, `src/audio.js`: persisted settings, synthesized sounds.
- `src/ui/`: `MatchView.jsx` (rAF → fixed frames, canvas drawn from engine state), screens, settings, dev overlay. Never re-implements rules.
- `tests/*.spec.js`: Vitest, `describe/it/expect` style.

## Invariants (do not break)
1. **Engine state is the only truth.** `MatchView` keeps the run (match, bot, controller) in a ref and draws the canvas from `engine.getState()` every animation frame; React state holds only screen phase, results and a throttled HUD. Never copy React state back into refs with `useEffect`: that was the root cause of the skipped/repeated piece bug (see AUDIT).
2. **Pieces leave the bag in one place only**, `takeNextType()` in `engine.js`. Previews, hold and rendering must never call `bag.next()`.
3. Every aligned group of 7 draws is a permutation of `IJLOSTZ`. The first hold of a piece consumes exactly one queued piece. Swapping with a filled hold consumes none. One hold per piece until it locks.
4. Same seed + same engine calls give an identical game. Keep `Math.random`, `Date`, timers and DOM out of `src/game` and out of AI decisions (`src/ai` uses seeded randomness; only measured think time is wall-clock). Game time is frames: anything time-based in the rules goes through `tick()`.
5. Discrete inputs (taps, rotations, hold, hard drop) are queued on keydown and replayed in press order on the next frame. Do not go back to per-frame edge detection.
6. Board indexing is `board[y][x]` on a 40-row board (rows 0-19 hidden buffer), y grows downward, and `piece.x/y` is the bounding-box top-left. Rotation states are 0, R(1), 2, L(3). Cells with `y < 0` are valid during spawn/rotation.
7. Keep canonical SRS matrices (JLSTZ 3x3, I 4x4, O 2x2). Do not trim matrices at runtime.
8. The AI plays through `engine.apply()` only, with the same rules object as the board it plays. Its placements must be reachable by `findPath` (tests/ai.spec.js replays them). It must never stall: keep the late-plan fallback and the per-piece input cap.

## Adding behaviour
- A new rule goes in `src/game` with a test in `tests/`. Presentation goes in `src/ui`; handling (DAS/ARR) in `src/input`.
- A bag, queue or hold bug fix gets a regression test in `tests/engine.spec.js` or `tests/bagRNG.spec.js`.
- Per-player or per-encounter rule tweaks are `rules` overrides (`createMatch({ playerRules })`), not branches in the engine. New opponents are entries in `src/ai/profiles.js`.
- A rotation change goes through `rotationHarness.js` and `tests/rotationConformance.spec.js`.
- Don't change game rules (lock delay, kicks, scoring) silently. Record intentional changes in docs/AUDIT.md.
