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
