# Audit (2026-11)

## Fixed

### 1. Skipped / repeated pieces: stale refs from React effects (high)
**Symptom:** pieces occasionally missing from the sequence, or the just-placed piece showing up again (often in hold right after a hard drop).
**Root cause:** the 7-bag generator was correct. `GameBoard` stored every piece of game state twice: in refs written by game code, and in React state. `useEffect(() => { pieceRef.current = piece }, [piece])` (likewise for board, hold, canHold, level, lines) copied state back into the refs. Passive effects run after paint, and `requestAnimationFrame` runs before paint. So when a frame fell between a commit and its effects, the effect overwrote a newer ref with an older committed value. A hold or drop in that window then acted on the previous piece and board: the old piece's type went into hold, a new piece was drawn, and the real current piece was never played. The bug was timing-dependent, so it got worse when renders were slow (dev mode, StrictMode double render, a full re-render every frame).
**Fix:** the rules moved into `src/game/engine.js` (`createGame`), which is now the single source of truth. The component holds the engine in a ref and only pushes snapshots into React state. All ref-sync effects were removed.
**Evidence:** `tests/engine.spec.js` covers spawn order across bag boundaries, preview vs. bag sequence, hold consumption and hold right after a hard drop. The race itself depends on browser frame timing and was **not reproduced in a browser**. The fix removes the mechanism structurally.

### 2. Lost and out-of-order inputs (medium)
**Root cause:** hold and rotations were detected by comparing key state between frames, so a press and release within one frame (or during a slow frame) was lost. Hard drop was always processed before hold, so hold-then-drop pressed in the same frame dropped the wrong piece. The first left/right tap had the same frame-edge dependency.
**Fix:** discrete presses are queued on keydown and replayed in press order on the next frame. DAS is measured from the keydown timestamp.
**Evidence:** lint and build pass. Not verified in a browser (no automation available).

### 3. Stray `vtest` dependency (low)
An unrelated podcast package (`vtest`, likely a typo for `vitest`) was in devDependencies. Removed.

### 4. Post-game actions (low)
Queued actions or a pending lock timer could act after the run ended within the same frame. `runOverRef` now stops processing once a run ends, and engine methods are no-ops after top-out.

## Verified as correct
- `createBagRNG`: Fisher–Yates over a fresh copy, lazy refill, seedable. Tested over 5000 bags, at boundaries and with a degenerate `random`.
- SRS / SRS+ kicks: existing conformance tests pass.
- Spawn columns match the guideline (JLSTZ cols 3–5, I 3–6, O 4–5).

## Remaining issues (by severity)
1. **Medium: lock delay resets without limit.** Every successful move or rotate on the ground restarts the 500 ms timer, so a piece can be stalled forever. TETR.IO and the guideline cap resets at 15. This is a rule change, so it was left for a deliberate decision.
2. **Medium: wall-clock lock timer.** Lock delay is a `setTimeout`, while gravity and the timer use rAF time. In a hidden tab rAF stops but the timeout can still lock the piece. It also blocks deterministic replay and multiplayer (see ARCHITECTURE).
3. **Medium: full re-render every frame.** `setElapsedTimeMs` re-renders 200 board cells each frame. It's fine on desktop and the cheapest win if performance matters.
4. **Low: no hidden buffer rows.** Pieces spawn inside the visible 20 rows, and lock-out is "any cell above row 0". It will need revisiting when garbage can push the stack up.
5. **Low: missing modern mechanics.** No T-spin detection, combos, back-to-back, garbage, or drop points.
6. **Low: unused code.** `src/components/ResultsScreen.jsx`, `src/App.css` and `src/assets/react.svg` are not imported. They were kept because removing them was out of scope. `App.jsx` still logs to the console.
7. **Low: no component-level tests.** Input timing, countdown and phase transitions have no automated tests (no DOM test environment is installed).

# Multiplayer readiness (2026-11)

**Verdict:** the rules layer is a good base. The timing and orchestration layer is not ready yet. `src/game` is pure, seedable and runs in Node unchanged, so a server or a peer can replay a game from `seed + inputs`. But half of what decides the outcome of a game (gravity, lock delay, scoring, win/lose) lives in `GameBoard.jsx` and runs on wall-clock time, so two machines fed the same inputs can still diverge.

## Recommended model
Versus falling-block games don't need full lockstep. Each player's board is independent, and the only interaction is garbage. The cheapest model that holds up:
- Each client simulates **its own** board locally with zero input latency.
- Clients send a compact input log (`[tick, action]`) plus outgoing attack events. Opponent boards are rendered from relayed snapshots or by replaying that log.
- The server (Node, running the same `src/game` code) replays logs to validate results and resolve garbage timing. Periodic state hashes catch desyncs.

This needs about 1 KB/s per player, and nothing has to be rolled back except incoming garbage.

## Blockers (must fix first)
1. **Time is outside the engine (high).** Gravity uses a rAF accumulator with deltas clamped to 100 ms (`GameBoard.jsx` `processInputFrame`), lock delay is a `setTimeout`, and DAS/ARR use `performance.now()`. The same inputs at different frame rates give different games. Fix: `engine.tick()` on a fixed step (e.g. 60 Hz), with gravity, lock delay and the lock-reset cap inside the engine. The component converts wall time into a number of ticks.
2. **Outcome rules live in the component (high).** Scoring, level and gravity selection, sprint completion and top-out handling after hold are all in `GameBoard.jsx`. A server can't compute them. Fix: move them into `src/game`, and make `lock()` return the full clear result (lines, T-spin, combo, B2B, attack).
3. **No input log (high).** Actions go straight from the queue to engine calls and are not recorded. Fix: one `apply(action)` entry point on the engine (`left | right | softDrop | hardDrop | rotateCW | rotateCCW | rotate180 | hold`) that records `[tick, action]`. Soft drop must become a press/release action instead of polled key state. DAS/ARR stay client-side as handling that only produces actions.

## Needed for versus
4. **No garbage API or buffer rows (medium).** There is no `receiveGarbage(rows, hole)`, and there are no hidden rows above the field, so garbage pushes the stack straight into a top-out. Garbage holes need their **own** seeded RNG stream, so incoming attacks don't shift the piece sequence.
5. **No serialize/restore (medium).** The engine state is closure-private, and the bag PRNG state can't be exported. That blocks reconnect, spectator join and resync after a desync. Fix: `engine.serialize()` / `createGame({ restore })`, including the PRNG state and bag contents, plus a cheap `hash()` for desync checks.
6. **One-player component (medium).** `GameBoard.jsx` (1,100+ lines) mixes input, timing, rules glue and rendering for a single engine. Split it into a pure `<Board snapshot>` view (reused for opponents and spectators), a `useLocalPlayer` controller hook for input and timing, and a match coordinator that owns N engines and routes garbage.

## Efficiency
7. **Re-render every frame (medium).** `setElapsedTimeMs` re-renders all 200 cells per frame. Two boards double that cost, and four (FFA or spectating) quadruple it. Render the timer separately, memoize the board, or draw boards on `<canvas>`.
8. **Countdown and match start use local `setTimeout` (low).** Match start needs a server-provided start time and seed, not `?seed=` or `Math.random`.

## Already in good shape
- Deterministic, integer-only seeded PRNG (`Math.imul`), so results match across browsers and Node.
- Board and piece updates are immutable and `getState()` is plain data, so snapshots are cheap to send.
- Discrete inputs are already queued in press order (invariant 5), which maps directly onto an input log.
- No DOM or React code in `src/game`, so it runs on a server as is.

Suggested order: 1 → 3 → 2 → 5 → 4 → 6 → 7. Steps 1–3 are roadmap stage 1 and also give you replays.
