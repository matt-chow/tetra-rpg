# tetra-rpg

A fast, modern falling-block puzzle game for the browser, growing into a character-based puzzle RPG with head-to-head duels.

Today it's a polished single-player 40-line Sprint with modern handling: 7-bag randomizer, hold, five-piece preview, SRS rotation with 180° spins, and tight DAS/ARR. Next up are versus play, garbage attacks, heroes with their own abilities, and a campaign of boss encounters. See the [roadmap](docs/ROADMAP.md).

> **Status:** early development. The core game plays well, while combat, heroes and online play are still on the roadmap.

## Play locally

Requires [Node.js](https://nodejs.org/) 20.19 or newer.

```sh
git clone https://github.com/matt-chow/tetra-rpg.git
cd tetra-rpg
npm install
npm run dev
```

Then open http://localhost:5173.

URL options:
- `?seed=<text>`: play a reproducible piece sequence (handy for practice and bug reports)
- `?debugRotation`: log rotation kick attempts to the browser console

## Controls

| Action | Key |
|---|---|
| Move left / right | ← / → |
| Soft drop | ↓ |
| Hard drop | Space |
| Rotate clockwise | ↑ or X |
| Rotate counter-clockwise | Z |
| Rotate 180° | A |
| Hold | C |
| Pause | P or Esc |
| Restart | R |

## Features

- **40-line Sprint** with countdown, timer, pieces-per-second and a results screen
- **7-bag randomizer**, seedable for reproducible runs
- **Hold** (once per piece) and a **5-piece next preview**
- **SRS rotation** with wall kicks, plus TETR.IO-style 180° rotation
- **Ghost piece**, hard drop, soft drop, and an optional instant soft drop
- **Handling:** DAS 150 ms, ARR 40 ms, 500 ms lock delay

## Roadmap

1. **Stabilize:** fixed-step engine timing, replays, lock-reset cap, hidden buffer rows
2. **Versus:** T-spins, combos, back-to-back, garbage and an AI opponent
3. **Heroes:** characters with stat modifiers and abilities
4. **Campaign:** encounters and boss mechanics
5. **Online multiplayer**

Details are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Known limitations

- No T-spins, combos, back-to-back, garbage or versus play yet
- Lock delay resets without limit, so a grounded piece can be stalled indefinitely
- No hidden buffer rows above the 20-row field
- Keybinds and handling (DAS/ARR) aren't configurable yet

The full list is in [docs/AUDIT.md](docs/AUDIT.md).

## Development

```sh
npm run test:run   # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # production build into dist/
```

Built with React 19 and Vite. All game rules live in plain JavaScript under `src/game/` (no React, timers or DOM), so they're deterministic and easy to test. The React layer in `src/components/` handles timing, input and rendering.

- [Architecture](docs/ARCHITECTURE.md): how the engine and UI fit together
- [Rotation audit](docs/rotation-audit.md): SRS and kick-table conformance
- [AGENTS.md](AGENTS.md): contributor rules and invariants (read this before changing the engine)

## Contributing

Issues and pull requests are welcome. Please run tests, lint and build before opening a PR, and follow the invariants in [AGENTS.md](AGENTS.md). In particular, rule changes go in `src/game/` with a test.
