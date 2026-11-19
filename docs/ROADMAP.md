# Roadmap

## Done
- Frame-based engine with TETR.IO Season 1 rules: buffer rows, lock-reset cap, T-spins, combos, B2B, perfect clears, attack table, garbage queue with travel, cancel and cap.
- Match coordinator for N boards with attack routing, a garbage trainer and a sprint goal.
- Beam-search AI in a Web Worker with four config-driven opponents (Apprentice, Expert, Master, Legendary).
- AI Battle, Practice and 40L Sprint screens, persisted settings with key rebinding, and a developer overlay.

## 1. Polish and replays (next)
- Record `[frame, action]` input logs around `engine.apply`, plus a replay viewer and replay regression tests.
- `engine.serialize()` / `hash()` for desync checks and resync.
- Verify SRS+ I-piece kicks and S1 gravity against TETR.IO and adjust (see AUDIT, unverified items).
- Opponent-board danger cues, a garbage-hole preview and better attack animations.
- DOM tests for screen flow and input (needs a DOM test environment).

## 2. Heroes and progression
- Hero = data: rule overrides (gravity, lock delay, preview count, garbage multiplier) and abilities triggered by engine events (clear, combo, garbage received).
- The ability system subscribes to engine events. Rules stay in the engine and are parameterized, not forked.
- Persistent progression and unlocks (local save first).

## 3. Campaign and bosses
- Encounter definitions: enemy AI profile + rules + starting board + scripted mechanics (timed garbage patterns, phase changes).
- Boss mechanics expressed as engine events/modifiers so they replay deterministically.

## 4. Online multiplayer
- Each client simulates its own board. Input logs and attack events are relayed, and a Node server replays them with the same `src/game` code to validate results.
