# AGENTS.md

Guidance for coding agents and contributors. Architecture details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Known issues: [docs/AUDIT.md](docs/AUDIT.md).

## Commands
- Install: `npm install`
- Dev server: `npm run dev` (append `?seed=<text>` for a reproducible piece sequence, `?debugRotation` for kick logs)
- Tests once: `npm run test:run` (Vitest)
- Lint: `npm run lint`
- Build: `npm run build`

Run tests, lint and build before finishing any change.

## Layout
- `src/game/*.js`: pure gameplay logic, no React, no timers, no DOM.
  - `engine.js`: `createGame()`, the single source of truth for board, active piece, queue, hold, lock, line clear and top-out.
  - `pieces.js`: piece spawning and the 7-bag randomizer (`createBagRNG`, seedable or injectable `random`).
  - `rotation.js`: SRS rotation + kicks (TETR.IO SRS+ 180 kicks by default). See [docs/rotation-audit.md](docs/rotation-audit.md).
  - `rotationHarness.js`: kick conformance harness used by tests.
  - `board.js`, `constants.js`, `sprint.js`: helpers and tuning.
- `src/components/GameBoard.jsx`: timing (gravity, lock delay, DAS/ARR, countdown), input, scoring and rendering. Calls the engine; never re-implements rules.
- `tests/*.spec.js`: Vitest, `describe/it/expect` style.

## Invariants (do not break)
1. **Engine state is the only truth.** `GameBoard` keeps the engine in `engineRef` and mirrors it into React with `syncGame()` after every mutation. Never copy React state back into refs with `useEffect`: that was the root cause of the skipped/repeated piece bug (see AUDIT).
2. **Pieces leave the bag in one place only**, `takeNextType()` in `engine.js`. Previews, hold and rendering must never call `bag.next()`.
3. Every aligned group of 7 draws is a permutation of `IJLOSTZ`. The first hold of a piece consumes exactly one queued piece. Swapping with a filled hold consumes none. One hold per piece until it locks.
4. Same seed + same engine calls give an identical game. Keep `Math.random`, `Date`, timers and DOM out of `src/game`.
5. Discrete inputs (taps, rotations, hold, hard drop) are queued on keydown and replayed in press order on the next frame. Do not go back to per-frame edge detection.
6. Board indexing is `board[y][x]`, y grows downward, and `piece.x/y` is the bounding-box top-left. Rotation states are 0, R(1), 2, L(3). Cells with `y < 0` are valid during spawn/rotation.
7. Keep canonical SRS matrices (JLSTZ 3x3, I 4x4, O 2x2). Do not trim matrices at runtime.

## Adding behaviour
- A new rule goes in `src/game` with a test in `tests/`. Timing and presentation go in the component.
- A bag, queue or hold bug fix gets a regression test in `tests/engine.spec.js` or `tests/bagRNG.spec.js`.
- A rotation change goes through `rotationHarness.js` and `tests/rotationConformance.spec.js`.
- Don't change game rules (lock delay, kicks, scoring) silently. Record intentional changes in docs/AUDIT.md.
