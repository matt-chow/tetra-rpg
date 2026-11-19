import { useEffect, useRef, useState } from "react";
import { createMatch } from "../game/match.js";
import { describeClear } from "../game/attack.js";
import { FRAME_MS } from "../game/constants.js";
import { formatDuration, SPRINT_TARGET_LINES } from "../game/sprint.js";
import { createBot } from "../ai/bot.js";
import { createWorkerPlanner } from "../ai/planner.js";
import { createController } from "../input/controller.js";
import { keyMap } from "../settings.js";
import { playSound } from "../audio.js";
import { boardCenter, drawPlayfield, HEIGHT, meterTop, WIDTH } from "./drawPlayfield.js";
import { buttonStyle, panelStyle, theme } from "./theme.js";
import DevOverlay from "./DevOverlay.jsx";

const INTRO_FRAMES = 100;
const COUNT_FRAMES = 45; // per 3-2-1 step
const OVER_DELAY = 50; // frames of top-out shown before the results card
const HORIZONTAL = new Set(["left", "right", "softDrop"]);
const ACTION_SOUND = { left: "move", right: "move", cw: "rotate", ccw: "rotate", 180: "rotate", hold: "hold" };

function urlSeed() {
  return new URLSearchParams(window.location.search).get("seed");
}

function newSeed() {
  return urlSeed() ?? Math.random().toString(36).slice(2, 8);
}

function lockPopups(e) {
  const out = [];
  const clear = describeClear({ lines: e.linesCleared, tspin: e.tspin });
  if (clear) out.push({ text: clear, color: e.tspin ? "#B388FF" : "#ffffff", big: true });
  if (e.perfectClear) out.push({ text: "PERFECT CLEAR", color: "#64C7FF", big: true });
  if (e.b2b > 0 && e.linesCleared) out.push({ text: `B2B x${e.b2b}`, color: "#FFD54F" });
  if (e.combo > 0) out.push({ text: `${e.combo} COMBO`, color: "#69F0AE" });
  if (e.attack > 0) out.push({ text: `+${e.attack}`, color: theme.danger });
  return out.map((p, slot) => ({ ...p, slot, age: 0 }));
}

function summary(engine, frames) {
  const s = engine.getState();
  const minutes = frames / 3600;
  return {
    pieces: s.piecesPlaced,
    lines: s.lines,
    attack: s.stats.attack,
    sent: s.stats.sent,
    pps: frames ? s.piecesPlaced / (frames / 60) : 0,
    apm: minutes ? s.stats.attack / minutes : 0,
    maxCombo: s.stats.maxCombo,
    tspins: s.stats.tspins,
    quads: s.stats.quads,
  };
}

// One match on screen: fixed 60 Hz simulation driven by requestAnimationFrame,
// rendered to a single canvas straight from engine state (no React mirror).
// mode: "battle" | "practice" | "sprint"
export default function MatchView({ mode, profile, practice, settings, onExit, onChangeOpponent }) {
  const canvasRef = useRef(null);
  const settingsRef = useRef(settings);
  const live = useRef(null); // current run: match, bot, controller, fx, phase...
  const [seed, setSeed] = useState(newSeed);
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState(mode === "battle" ? "intro" : "countdown");
  const [hud, setHud] = useState(null);
  const [result, setResult] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  const devOpenRef = useRef(false);
  devOpenRef.current = devOpen;
  settingsRef.current = settings;

  const battle = mode === "battle";
  const players = battle ? 2 : 1;

  function restart(nextSeed = newSeed()) {
    setSeed(nextSeed);
    setRunId((n) => n + 1);
  }

  useEffect(() => {
    const match = createMatch({
      seed,
      players,
      rules: practice ? { gravity: practice.gravity } : undefined,
      trainer: practice?.trainer ?? null,
      goalLines: mode === "sprint" ? SPRINT_TARGET_LINES : null,
    });
    const planner = battle ? createWorkerPlanner() : null;
    const bot = battle ? createBot({ profile, seed: `${seed}:bot`, planner }) : null;
    const controller = createController(settingsRef.current.handling);
    const run = {
      match,
      bot,
      controller,
      seed,
      phase: battle ? "intro" : "countdown",
      clock: 0, // frames since the run started, including intro/countdown
      playFrames: 0,
      overAt: 0,
      frozen: false,
      untilDecision: -1,
      popups: Array.from({ length: players }, () => []),
      shots: [],
    };
    live.current = run;
    setPhase(run.phase);
    setResult(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * players * dpr;
    canvas.height = HEIGHT * dpr;

    function enter(next) {
      run.phase = next;
      setPhase(next);
    }

    function handleEvents(events) {
      const fx = settingsRef.current.graphics.animations;
      for (const e of events) {
        if (e.kind === "lock") {
          if (e.player === 0) playSound(e.tspin && e.linesCleared ? "tspin" : e.linesCleared === 4 ? "quad" : e.linesCleared ? "clear" : "lock");
          if (fx) run.popups[e.player].push(...lockPopups(e));
          if (fx && e.sent > 0 && players > 1) run.shots.push({ from: e.player, lines: e.sent, age: 0 });
        } else if (e.kind === "garbageQueued" && e.player === 0 && players > 1) {
          playSound("garbage");
        }
      }
    }

    function simStep() {
      const human = match.players[0];
      for (const action of controller.update(human)) {
        if (ACTION_SOUND[action]) playSound(ACTION_SOUND[action]);
      }
      bot?.update(match.players[1]);
      const { events, result: res } = match.step();
      run.playFrames += 1;
      handleEvents(events);
      for (const list of run.popups) {
        for (const p of list) p.age += 1;
        while (list.length && list[0].age > 60) list.shift();
        if (list.length > 6) list.splice(0, list.length - 6);
      }
      for (const s of run.shots) s.age += 1;
      run.shots = run.shots.filter((s) => s.age <= match.players[0].rules.garbageTravel);
      if (res) {
        run.result = res;
        run.overAt = run.clock + OVER_DELAY;
        enter("ending");
        const won = battle ? res.winner === 0 : res.reason === "goal";
        playSound(won ? "win" : "lose");
      }
    }

    // One 60 Hz frame of the whole screen, including intro and countdown.
    function frame() {
      if (run.phase === "paused") return;
      if (run.frozen && run.untilDecision < 0 && !run.stepOnce) return;
      run.stepOnce = false;
      run.clock += 1;
      if (run.phase === "intro" && run.clock >= INTRO_FRAMES) {
        run.clock = 0;
        enter("countdown");
      } else if (run.phase === "countdown") {
        if (run.clock % COUNT_FRAMES === 1 && run.clock < COUNT_FRAMES * 3) playSound("countdown");
        if (run.clock >= COUNT_FRAMES * 3) {
          playSound("go");
          enter("playing");
        }
      } else if (run.phase === "playing") {
        simStep();
      } else if (run.phase === "ending" && run.clock >= run.overAt) {
        const res = run.result;
        setResult({
          ...res,
          frames: run.playFrames,
          stats: match.players.map((e) => summary(e, run.playFrames)),
        });
        enter("over");
      }
      if (run.untilDecision >= 0 && (!bot || bot.stats.decisions > run.untilDecision || run.phase !== "playing")) {
        run.untilDecision = -1;
      }
    }

    function draw() {
      const g = settingsRef.current.graphics;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      match.players.forEach((engine, i) => {
        ctx.save();
        ctx.translate(i * WIDTH, 0);
        const state = engine.getState();
        drawPlayfield(ctx, state, {
          name: battle ? (i === 0 ? "YOU" : profile.name.toUpperCase()) : null,
          ghost: g.ghost,
          grid: g.grid,
          danger: state.incoming.length > 0 && engine.pendingGarbage() >= 4,
          popups: run.popups[i],
          plan: devOpenRef.current && i === 1 ? bot?.stats.lastPlan : null,
        });
        ctx.restore();
      });
      // Attack projectiles travel for exactly the garbage travel time.
      const travel = match.players[0].rules.garbageTravel;
      for (const s of run.shots) {
        const from = boardCenter();
        const to = meterTop();
        const t = s.age / travel;
        const fx = s.from * WIDTH + from.x;
        const tx = (1 - s.from) * WIDTH + to.x;
        const x = fx + (tx - fx) * t;
        const y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 80;
        ctx.fillStyle = theme.danger;
        ctx.beginPath();
        ctx.arc(x, y, 5 + Math.min(s.lines, 10), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;
    function loop(now) {
      acc += Math.min(250, now - last);
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 8) {
        acc -= FRAME_MS;
        steps += 1;
        frame();
      }
      if (steps === 8) acc = 0; // tab was asleep: drop the backlog instead of fast-forwarding
      draw();
      hudTimer += 1;
      if (hudTimer % 6 === 0) {
        setHud({
          clock: run.clock,
          phase: run.phase,
          time: run.playFrames * FRAME_MS,
          stats: match.players.map((e) => summary(e, run.playFrames)),
          frozen: run.frozen,
        });
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      planner?.dispose();
      live.current = null;
    };
  }, [runId, seed, battle, players, mode, profile, practice]);

  // Keyboard: queued into the controller on keydown/keyup, replayed in order next frame.
  useEffect(() => {
    function controlsFor(e) {
      return keyMap(settingsRef.current.controls)[e.code] ?? [];
    }
    function togglePause() {
      const run = live.current;
      if (!run) return;
      if (run.phase === "playing") {
        run.controller.reset();
        run.phase = "paused";
        setPhase("paused");
      } else if (run.phase === "paused") {
        run.phase = "playing";
        setPhase("playing");
      }
    }
    function onKeyDown(e) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Backquote" && e.shiftKey) {
        setDevOpen((v) => !v);
        return;
      }
      const run = live.current;
      const controls = controlsFor(e);
      if (!run || !controls.length) return;
      e.preventDefault();
      if (e.repeat) return;
      for (const control of controls) {
        if (control === "pause") togglePause();
        else if (control === "reset") {
          if (!battle || run.phase === "over" || run.phase === "paused") restart();
        } else if (run.phase === "playing" || (run.phase === "countdown" && HORIZONTAL.has(control))) {
          run.controller.press(control);
        }
      }
    }
    function onKeyUp(e) {
      for (const control of controlsFor(e)) live.current?.controller.release(control);
    }
    function onBlur() {
      live.current?.controller.reset();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [battle]);

  const run = live.current;
  const you = hud?.stats[0];
  const countdown = phase === "countdown" && hud ? 3 - Math.floor(hud.clock / COUNT_FRAMES) : null;
  const won = result && (battle ? result.winner === 0 : result.reason === "goal");

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", maxWidth: "100%" }}>
      <div style={{ position: "relative", maxWidth: "100%" }}>
        <canvas
          ref={canvasRef}
          aria-label={battle ? `Duel against ${profile.name}` : "Playfield"}
          style={{ display: "block", width: WIDTH * players, maxWidth: "100%", height: "auto", aspectRatio: `${WIDTH * players} / ${HEIGHT}` }}
        />

        {phase === "intro" && battle && (
          <Overlay>
            <div style={{ fontSize: 15, color: theme.muted, letterSpacing: 4 }}>AI BATTLE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 28, margin: "12px 0" }}>
              <strong style={{ fontSize: 34, color: "#64C7FF" }}>YOU</strong>
              <span style={{ fontSize: 22, color: theme.danger, fontWeight: 900 }}>VS</span>
              <strong style={{ fontSize: 34, color: "#FF6E6E" }}>{profile.name.toUpperCase()}</strong>
            </div>
            <div style={{ color: theme.muted }}>{profile.blurb}</div>
          </Overlay>
        )}

        {countdown !== null && countdown > 0 && (
          <Overlay dim={false}>
            <div style={{ fontSize: 96, fontWeight: 900, textShadow: "0 4px 20px #000" }}>{countdown}</div>
          </Overlay>
        )}

        {phase === "paused" && (
          <Overlay>
            <h2 style={{ marginTop: 0 }}>Paused</h2>
            <div style={{ display: "grid", gap: 10, minWidth: 200 }}>
              <button autoFocus style={buttonStyle(true)} onClick={() => { run.phase = "playing"; setPhase("playing"); }}>Resume</button>
              <button style={buttonStyle()} onClick={() => restart()}>Restart</button>
              <button style={buttonStyle()} onClick={onExit}>Quit to menu</button>
            </div>
          </Overlay>
        )}

        {phase === "over" && result && (
          <Overlay>
            <div style={{ ...panelStyle, minWidth: 320, textAlign: "center" }}>
              <h1 style={{ margin: "0 0 4px", fontSize: 34, color: won ? theme.good : theme.danger }}>
                {battle ? (result.reason === "draw" ? "Draw" : won ? "Victory" : "Defeat") : won ? "Finished" : "Topped out"}
              </h1>
              <div style={{ color: theme.muted, marginBottom: 14 }}>
                {battle ? `vs ${profile.name}` : mode === "sprint" ? "40 lines" : "Practice"} · {formatDuration(result.frames * FRAME_MS)}
              </div>
              <ResultTable stats={result.stats} names={battle ? ["You", profile.name] : ["You"]} />
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
                <button autoFocus style={buttonStyle(true)} onClick={() => restart()}>{battle ? "Rematch" : "Retry"}</button>
                {battle && <button style={buttonStyle()} onClick={onChangeOpponent}>Change difficulty</button>}
                <button style={buttonStyle()} onClick={onExit}>Menu</button>
              </div>
            </div>
          </Overlay>
        )}

        {you && (
          <div style={{ display: "flex", gap: 18, justifyContent: "center", fontFamily: theme.mono, fontSize: 13, color: theme.muted, marginTop: 6, flexWrap: "wrap" }}>
            <span>TIME <b style={{ color: theme.text }}>{formatDuration(hud.time)}</b></span>
            <span>PPS <b style={{ color: theme.text }}>{you.pps.toFixed(2)}</b></span>
            <span>APM <b style={{ color: theme.text }}>{you.apm.toFixed(1)}</b></span>
            {mode === "sprint" && <span>LINES <b style={{ color: theme.text }}>{you.lines}/{SPRINT_TARGET_LINES}</b></span>}
            {battle && <span>{profile.name} PPS <b style={{ color: theme.text }}>{hud.stats[1].pps.toFixed(2)}</b></span>}
            <span>Esc pause · R restart</span>
          </div>
        )}
      </div>

      {devOpen && run && (
        <DevOverlay
          run={run}
          hud={hud}
          onRestartWithSeed={(s) => restart(s)}
          onClose={() => setDevOpen(false)}
        />
      )}
    </div>
  );
}

function Overlay({ children, dim = true }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: dim ? "rgba(8,8,12,0.72)" : "transparent",
        color: "#f3f5ff",
        textAlign: "center",
        pointerEvents: dim ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

function ResultTable({ stats, names }) {
  const rows = [
    ["PPS", (s) => s.pps.toFixed(2)],
    ["APM", (s) => s.apm.toFixed(1)],
    ["Attack", (s) => s.attack],
    ["Lines", (s) => s.lines],
    ["Pieces", (s) => s.pieces],
    ["T-spins", (s) => s.tspins],
    ["Quads", (s) => s.quads],
    ["Max combo", (s) => Math.max(0, s.maxCombo)],
  ];
  return (
    <table style={{ width: "100%", fontFamily: theme.mono, fontSize: 14, borderCollapse: "collapse" }}>
      {names.length > 1 && (
        <thead>
          <tr>
            <th />
            {names.map((n) => <th key={n} style={{ textAlign: "right", color: theme.muted }}>{n}</th>)}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map(([label, get]) => (
          <tr key={label}>
            <td style={{ textAlign: "left", color: theme.muted, padding: "2px 0" }}>{label}</td>
            {stats.slice(0, names.length).map((s, i) => <td key={i} style={{ textAlign: "right" }}>{get(s)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
