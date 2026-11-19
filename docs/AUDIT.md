# Audit

## Season 1 rules, AI opponents and game modes (2026-11-18)

### Root causes found and fixed
1. **Rules and time lived in the component.** Gravity ran on a rAF accumulator, lock delay was a `setTimeout`, and scoring, sprint and top-out lived in `GameBoard.jsx`. As a result, the same inputs at different frame rates gave different games. Fix: `engine.tick()` on a 60 Hz frame clock now owns gravity, lock delay, the reset cap and garbage travel, and `createMatch` owns win/lose. The UI only converts wall time into frames. This also fixes the hidden-tab lock and the per-frame full re-render, since the board is now a canvas drawn from engine state.
2. **Lock event ordered after the next spawn.** Consumers saw `spawn` before the `lock` that caused it. The lock event is now pushed before spawning (tests/rules.spec.js "event order").
3. **AI 180° loop.** The bot's path search started every piece from spin state 0 even after the engine had registered a kick, so it could re-plan a 180 forever. The path start now uses the engine's `lastRotation`, and a 40-input cap per piece guarantees progress (tests/ai.spec.js).
4. **Apprentice exceeded its PPS range.** Human-paced bots soft-dropped early, and lock delay then auto-locked the piece ahead of schedule. Taps are now spread across the piece interval (tests/ai.spec.js "PPS ranges").

### Intentional rule changes
| Rule | Before | Now |
|---|---|---|
| Field | 10×20, spawn in rows 0–1 | 10×40, 20 hidden buffer rows, spawn at y=18 (just above the visible field) |
| Lock delay | 500 ms, unlimited resets | 30 frames, 15 move/rotate resets, counter refreshed on a new lowest row, gravity never spends resets |
| Gravity | level curve (lines / 10) | constant 0.02G (S1 default), configurable in Practice |
| Scoring | 100/300/500/800 × level | removed; results show attack, APM, PPS, lines, T-spins |
| T-spin / combo / B2B / PC | none | S1 attack table; 3-corner T-spin with mini; TST kick upgrades mini to full; S1 combo table and B2B chaining; PC +10 |
| Garbage | none | 20-frame travel; outgoing attack cancels incoming first (including garbage still travelling); at most 8 lines inserted per lock; no insertion on a clearing lock; hole changes between attacks; separate hole RNG |
| Top-out | block out, any cell above row 0 | block out, lock out (whole piece in the buffer), garbage pushing blocks out of the 40-row field |
| Handling | DAS 150 ms / ARR 40 ms, fixed | DAS 150 / ARR 33 / SDF 20 by default, configurable and persisted (ARR 0 = instant, SDF 41 = instant) |
| `?debugRotation` | console kick logs | removed with the old component; `tryRotateDetailed(..., { debug, onDebug })` still supports it |

### Assumptions and unverified behaviour
Sources: <https://tetris.wiki/TETR.IO>, <https://tetris.wiki/Super_Rotation_System>, <https://github.com/tetrio/issues/issues/506>.
- **Taken from those sources:** attack table, S1 combo multiplier (base × (1 + 0.25c), log curve from c ≥ 2), B2B chaining (`floor(1 + log1p(0.8b))` plus the fractional part), 20-frame garbage travel, 180 kicks.
- **Assumed, not checked against TETR.IO itself:** gravity 0.02G, lock delay 30 frames with 15 resets, garbage cap 8, the clear-blocks-insertion rule, hole change on every attack, PC +10, spawn y=18.
- **Unverified:** TETR.IO SRS+ I-piece kicks. Standard SRS I kicks are kept (see rotation-audit.md).
- **Browser checks (headless Edge driven over CDP, 2026-11-18):**
  - Played full duels against all four opponents through the Web Worker. Live PPS: Apprentice 0.68, Expert 1.22, Master 2.12, Legendary 3.43.
  - Exercised the intro, countdown, pause menu, results card and dev overlay with plan outlines.
  - Exercised Practice with the garbage trainer, DAS to both walls, hold, R restart, and key rebinding persisted to localStorage.
  - No console errors.
  - **Not checked:** real-device input feel and latency, audio output, touch or mobile, Safari and Firefox. A human player has not played a full duel against each tier.

### Remaining weaknesses
- In the solo benchmark, Apprentice tops out under steady trainer garbage (1–3 lines every 4 s) and sends almost nothing (0.04 attack per piece). That makes it easy, which is the intent, but it may be too passive.
- The AI evaluates T-spin doubles (TSDs) but plans no TST/TSD stacking setups, perfect clears beyond the search depth, or downstacking strategy. Garbage pressure is handled only through the danger and burn weights.
- Expert and below have no awareness of the opponent's board.
- A fixed seed fixes pieces, garbage holes and AI choices. In the browser, though, worker plans arrive after a wall-clock delay, so the frame a bot acts on can differ between runs and a seeded duel is not frame-identical. Tests and `bench:ai` use the sync planner and are fully deterministic. A true replay needs the bot's decision frames recorded in the input log.
- There are no DOM or component tests. Screen flow and keyboard handling were verified only by the scripted browser run above.

## Earlier audit (2026-11, pre-S1)

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

## Remaining issues at that time
The S1 work above resolves items 1–6: the reset cap, frame clock, canvas rendering, buffer rows and modern mechanics, plus removing the dead files.
1. **Medium: lock delay resets without limit.** Every successful move or rotate on the ground restarts the 500 ms timer, so a piece can be stalled forever. TETR.IO and the guideline cap resets at 15. This is a rule change, so it was left for a deliberate decision.
2. **Medium: wall-clock lock timer.** Lock delay is a `setTimeout`, while gravity and the timer use rAF time. In a hidden tab rAF stops but the timeout can still lock the piece. It also blocks deterministic replay and multiplayer (see ARCHITECTURE).
3. **Medium: full re-render every frame.** `setElapsedTimeMs` re-renders 200 board cells each frame. It's fine on desktop and the cheapest win if performance matters.
4. **Low: no hidden buffer rows.** Pieces spawn inside the visible 20 rows, and lock-out is "any cell above row 0". It will need revisiting when garbage can push the stack up.
5. **Low: missing modern mechanics.** No T-spin detection, combos, back-to-back, garbage, or drop points.
6. **Low: unused code.** `src/components/ResultsScreen.jsx`, `src/App.css` and `src/assets/react.svg` are not imported. They were kept because removing them was out of scope. `App.jsx` still logs to the console.
7. **Low: no component-level tests.** Input timing, countdown and phase transitions have no automated tests (no DOM test environment is installed).

# Multiplayer readiness (2026-11)

> **Update 2026-11-18:** resolved: blockers 1–2 and items 4, 6, 7 and 8. That covers the frame-clock engine, the `apply(action)` entry point, the garbage API with buffer rows and a separate hole RNG, `createMatch` for N boards, canvas rendering and a frame-counted countdown. Still open: 3 (recording the input log) and 5 (serialize/restore and hash).

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
