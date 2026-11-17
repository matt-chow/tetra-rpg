# Architecture

## Layers
```
GameBoard.jsx (React)                         src/game (pure JS)
───────────────────────────────────           ──────────────────────────────
keydown → action queue ─┐                     engine.js  createGame({seed|random})
rAF frame loop ─────────┼─ calls ───────────▶   move / rotate / dropToFloor
lock-delay setTimeout ──┘                       hold / lock / isGrounded
                         ◀── getState() ──────   getState() snapshot
setGame(snapshot) → render                    pieces.js  createBagRNG (7-bag)
scoring, sprint finish, phases                rotation.js SRS + kicks
```

**Engine (`src/game/engine.js`)** owns all rule state: board, active piece, next queue, hold, `canHold`, pieces placed, lines and `toppedOut`. It is deterministic given a seed (or injected `random`). It has no timers and no React.

**Component (`src/components/GameBoard.jsx`)** owns time and presentation:
- *Phases*: `idle → countdown → playing ⇄ paused → finished | failed`. Restart (R) always rebuilds the engine.
- *Frame loop* (`requestAnimationFrame`): replays queued discrete actions in press order, then DAS/ARR repeats, then soft drop / gravity.
- *Lock delay*: one `setTimeout` (500 ms). A successful move or rotate while grounded restarts it.
- *Scoring*: 100/300/500/800 × (level + 1), where level = lines / 10.
- After any engine mutation it calls `syncGame()` to store `engine.getState()` in React state. React state is never read for gameplay decisions.

## Randomizer, queue and hold
- `createBagRNG` shuffles a fresh copy of the 7 pieces (Fisher–Yates) when the bag is empty. `seed` uses a hashed mulberry32-style PRNG.
- The engine keeps `queue` (types) topped up to `previewCount` (5) inside `takeNextType()`, the only function that draws from the bag.
- Hold: when hold is empty, the active piece goes to hold and the next piece comes from `takeNextType()`. When hold is filled, the pieces swap and the queue is untouched. A swapped-in piece always spawns fresh (state 0, spawn position).

## Top-out
- *Block out*: the next spawn overlaps the stack (`lock().blockOut` or `toppedOut` after a hold).
- *Lock out*: a piece locks with any cell above row 0 (`lock().lockOut`).
- The field is 10×20 with no hidden rows. Pieces spawn in rows 0–1.

## Extension points (not implemented)
- **Combat/garbage**: add `engine.receiveGarbage(rows, hole)` that pushes rows up and checks for top-out, and have `lock()` return the clear type (lines, T-spin, combo, B2B) so an attack calculator outside the engine can turn clears into garbage. Keep cancellation/queueing outside the board.
- **Hero modifiers**: pass rule parameters (preview count, hold enabled, gravity/lock tuning) into `createGame` or the component's timing config, rather than branching inside rules.
- **Multiplayer**: the engine is already deterministic per seed. Lockstep or replay needs (1) game time from a fixed-step clock instead of wall-clock `setTimeout` lock delay, and (2) a serializable input log `[frame, action]`. Moving lock delay and gravity into the engine as `tick(ms)` is the main prerequisite.
