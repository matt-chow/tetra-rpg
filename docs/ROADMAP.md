# Roadmap

## 1. Stabilize (next)
- Decide on the lock-delay reset cap (15, TETR.IO-style) and implement it in one place.
- Move gravity and lock delay into the engine as `tick(ms)` with a fixed step, so the component only feeds time and inputs. This enables replays.
- Record `[frame, action]` input logs + seed, plus a replay test harness.
- Add hidden buffer rows and guideline lock-out/block-out.
- Throttle timer re-renders; add a DOM test environment for input/phase tests.

## 2. Versus core
- Clear classification returned from `lock()`: lines, T-spin (3-corner), combo, back-to-back, all-clear.
- Attack table → garbage queue with cancellation; `receiveGarbage` on the engine.
- Two engines side by side, plus a simple AI opponent driven through the same input API.

## 3. Heroes and progression
- Hero = data: stat modifiers (gravity, lock delay, preview count, attack multipliers) and abilities triggered by engine events (clear, combo, garbage received).
- Ability system subscribes to engine results. Rules stay in the engine and are parameterized, not forked.
- Persistent progression and unlocks (local save first).

## 4. Campaign and bosses
- Encounter definitions: enemy AI profile + hero kit + scripted mechanics (board effects, timed garbage patterns, phase changes).
- Boss mechanics expressed as engine events/modifiers so they replay deterministically.

## 5. Online multiplayer
- Shared seed + input-log lockstep or server-relayed garbage. Prerequisite: fully deterministic engine ticks (stage 1).
