# teto-clone

A single-player, modern-guideline-style falling-block puzzle game built with React 19 and Vite. It is the foundation for a planned character-based puzzle RPG with duel combat (see [docs/ROADMAP.md](docs/ROADMAP.md)).

## Setup
```sh
npm install
npm run dev        # http://localhost:5173
npm run test:run   # unit tests (Vitest)
npm run lint
npm run build
```
URL options: `?seed=<text>` gives a reproducible piece sequence, and `?debugRotation` logs rotation kicks to the console.

## Current features
- 40-line Sprint mode with countdown, timer, PPS and results overlay
- 7-bag randomizer (seedable), 5-piece next preview, hold (once per piece)
- SRS rotation with wall kicks, plus TETR.IO-style 180° rotation
- Ghost piece, hard drop, soft drop (or an "infinite" sonic-drop toggle), 500 ms lock delay
- DAS 150 ms / ARR 40 ms, pause, restart, main menu

Controls: arrows move/soft drop, Up/X rotate CW, Z rotate CCW, A rotate 180, Space hard drop, C hold, P/Esc pause, R restart.

## Known limitations
- No combos, back-to-back, T-spin detection, garbage or versus play yet
- Lock delay resets without limit (pieces can be stalled indefinitely)
- No hidden buffer rows above the 20-row field
- Keybinds and handling (DAS/ARR) are not configurable

See [docs/AUDIT.md](docs/AUDIT.md) for the full list and [AGENTS.md](AGENTS.md) for contributor rules.
