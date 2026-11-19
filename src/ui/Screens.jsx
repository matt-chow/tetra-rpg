import { AI_PROFILE_ORDER, getProfile } from "../ai/profiles.js";
import { buttonStyle, panelStyle, theme } from "./theme.js";

export function Menu({ onSelect }) {
  const items = [
    ["battle", "AI Battle", "Duel one of four bots. First to top out loses."],
    ["practice", "Practice", "Endless solo play with gravity and garbage training."],
    ["sprint", "40L Sprint", "Clear 40 lines as fast as you can."],
    ["settings", "Settings", "Controls, handling, audio and graphics."],
  ];
  return (
    <div style={{ ...panelStyle, minWidth: 320, maxWidth: 420, textAlign: "center" }}>
      <h1 style={{ marginTop: 0, marginBottom: 18, fontSize: 30, letterSpacing: 1 }}>Teto</h1>
      <nav style={{ display: "grid", gap: 10 }}>
        {items.map(([id, label, hint], i) => (
          <button key={id} autoFocus={i === 0} style={{ ...buttonStyle(i === 0), textAlign: "left" }} onClick={() => onSelect(id)}>
            <div>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: i === 0 ? "#e6f1ff" : theme.muted }}>{hint}</div>
          </button>
        ))}
      </nav>
    </div>
  );
}

export function OpponentSelect({ onPick, onBack }) {
  return (
    <div style={{ ...panelStyle, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>Choose your opponent</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {AI_PROFILE_ORDER.map((id, i) => {
          const p = getProfile(id);
          return (
            <button key={id} autoFocus={i === 0} onClick={() => onPick(p)} style={{ ...buttonStyle(), textAlign: "left", padding: 14 }}>
              <div style={{ fontSize: 18 }}>{p.name}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 12, color: theme.accent, margin: "4px 0" }}>
                {p.pps[0]}–{p.pps[1]} PPS
              </div>
              <div style={{ fontSize: 12, fontWeight: 400, color: theme.muted }}>{p.blurb}</div>
            </button>
          );
        })}
      </div>
      <button style={{ ...buttonStyle(), marginTop: 16 }} onClick={onBack}>Back</button>
    </div>
  );
}

const GRAVITY_OPTIONS = [
  ["None", 0],
  ["S1 default (0.02G)", 0.02],
  ["Fast (0.1G)", 0.1],
  ["Very fast (1G)", 1],
  ["20G", 20],
];

export function PracticeSetup({ value, onChange, onStart, onBack, onSettings }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const trainer = value.trainer;
  const field = { display: "grid", gap: 4, textAlign: "left" };
  return (
    <div style={{ ...panelStyle, minWidth: 320, maxWidth: 420 }}>
      <h2 style={{ marginTop: 0 }}>Practice</h2>
      <div style={{ display: "grid", gap: 14 }}>
        <label style={field}>
          Gravity
          <select value={value.gravity} onChange={(e) => set({ gravity: Number(e.target.value) })}>
            {GRAVITY_OPTIONS.map(([label, g]) => <option key={g} value={g}>{label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={Boolean(trainer)}
            onChange={(e) => set({ trainer: e.target.checked ? { interval: 300, min: 1, max: 4 } : null })}
          />
          Garbage training
        </label>
        {trainer && (
          <>
            <label style={field}>
              Every {(trainer.interval / 60).toFixed(1)} s
              <input type="range" min={60} max={900} step={30} value={trainer.interval} onChange={(e) => set({ trainer: { ...trainer, interval: Number(e.target.value) } })} />
            </label>
            <label style={field}>
              Lines per attack: {trainer.min}–{trainer.max}
              <input type="range" min={1} max={8} value={trainer.max} aria-label="Maximum lines" onChange={(e) => {
                const max = Number(e.target.value);
                set({ trainer: { ...trainer, max, min: Math.min(trainer.min, max) } });
              }} />
            </label>
          </>
        )}
        <div style={{ color: theme.muted, fontSize: 13 }}>DAS, ARR and soft drop speed live in Settings.</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button autoFocus style={buttonStyle(true)} onClick={onStart}>Start</button>
        <button style={buttonStyle()} onClick={onSettings}>Settings</button>
        <button style={buttonStyle()} onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
