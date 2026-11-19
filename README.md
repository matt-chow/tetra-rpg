# tetra-rpg

A fast, modern falling-block puzzle game for the browser, growing into a character-based puzzle RPG with head-to-head duels.

It plays by TETR.IO Season 1 versus rules: 7-bag, hold, five-piece preview, SRS+ with 180° spins, T-spins, combos, back-to-back, perfect clears and garbage with cancellation. You can duel four AI opponents, practice endlessly with optional garbage training, or race a 40-line Sprint. Heroes, abilities and a campaign come next. See the [roadmap](docs/ROADMAP.md).

> **Status:** early development. Versus against the AI is playable. Heroes, campaign and online play are still on the roadmap.

## Play locally

Requires [Node.js](https://nodejs.org/) 20.19 or newer.

```sh
git clone https://github.com/matt-chow/tetra-rpg.git
cd tetra-rpg
npm install
npm run dev
```

Then open http://localhost:5173.

- `?seed=<text>` makes every run use a fixed seed (pieces, garbage holes and AI decisions), which is handy for practice and bug reports.
- **Shift + `** toggles the developer overlay during a game: AI stats and decisions, queues, garbage, frame stepping, and restart with a seed.

## Modes

- **AI Battle:** pick an opponent, then versus intro, 3-2-1 and a duel. The first to top out loses. Afterwards: rematch, change difficulty or return to the menu.

  | Opponent | Speed | Style |
  |---|---|---|
  | Apprentice | 0.4–0.8 PPS | human-paced taps, shallow search, occasional mistakes |
  | Expert | 0.9–1.5 PPS | human-paced, two-piece lookahead, builds for quads and T-spins |
  | Master | 1.7–2.5 PPS | fast movement, three-piece lookahead, T-spins and B2B |
  | Legendary | 2.8–4.0 PPS | fast movement, four-piece lookahead, no mistakes |

- **Practice:** endless solo play with adjustable gravity, an optional garbage trainer, and live PPS/APM.
- **40L Sprint:** clear 40 lines as fast as you can.

## Controls (rebindable in Settings)

| Action | Default key |
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

Settings also cover DAS, ARR and soft drop speed (instant ARR and soft drop allowed), volume, ghost piece, grid and animations. They're saved in your browser.

## Known limitations

- Some TETR.IO details are assumed rather than verified, such as gravity, lock delay and SRS+ I-piece kicks. See [docs/AUDIT.md](docs/AUDIT.md).
- No replays, online play, touch controls or heroes yet.
- Tested by script in headless Edge only. There are no manual checks on other browsers or on mobile yet.

## Development

```sh
npm run test:run   # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # production build into dist/
npm run bench:ai   # AI benchmark: solo PPS/attack per profile and tier-vs-tier duels
```

Built with React 19 and Vite.
- `src/game/` holds all rules: plain JavaScript on a 60 Hz frame clock, with no timers, randomness or DOM, so matches are deterministic and testable in Node.
- `src/ai/` holds the bots.
- `src/input/` handles DAS/ARR.
- `src/ui/` holds the screens and the canvas renderer.

Docs:
- [Architecture](docs/ARCHITECTURE.md): how the engine, match, AI and UI fit together
- [Audit](docs/AUDIT.md): rule decisions, assumptions and known issues
- [Rotation audit](docs/rotation-audit.md): SRS and kick-table conformance
- [AGENTS.md](AGENTS.md): contributor rules and invariants (read this before changing the engine)

## Contributing

Issues and pull requests are welcome. Please run tests, lint and build before opening a PR, and follow the invariants in [AGENTS.md](AGENTS.md). In particular, rule changes go in `src/game/` with a test.
