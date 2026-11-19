import { useEffect, useState } from "react";
import { CONTROL_LABELS, DEFAULT_SETTINGS, INSTANT_SDF } from "../settings.js";
import { buttonStyle, panelStyle, theme } from "./theme.js";

function keyName(code) {
  return code.replace(/^(Key|Digit)/, "");
}

export default function SettingsScreen({ settings, onChange, onBack }) {
  const [listening, setListening] = useState(null); // control waiting for a key
  const set = (section, patch) => onChange({ ...settings, [section]: { ...settings[section], ...patch } });

  // Rebinding: the next key pressed replaces this control's bindings (Escape cancels).
  useEffect(() => {
    if (!listening) return;
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") {
        const controls = Object.fromEntries(
          Object.entries(settings.controls).map(([c, codes]) => [c, codes.filter((k) => k !== e.code)]),
        );
        controls[listening] = [e.code];
        onChange({ ...settings, controls });
      }
      setListening(null);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, settings, onChange]);

  const { handling, audio, graphics } = settings;
  const row = { display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr", gap: 10, alignItems: "center" };
  const section = { borderTop: `1px solid ${theme.border}`, paddingTop: 12, marginTop: 12, display: "grid", gap: 8 };

  return (
    <div style={{ ...panelStyle, width: 520, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto" }}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      <section style={{ display: "grid", gap: 6 }} aria-label="Controls">
        <strong>Controls</strong>
        {Object.keys(CONTROL_LABELS).map((control) => (
          <div key={control} style={row}>
            <span>{CONTROL_LABELS[control]}</span>
            <button
              style={{ ...buttonStyle(listening === control), padding: "6px 10px", fontFamily: theme.mono, fontWeight: 500 }}
              onClick={() => setListening(control)}
            >
              {listening === control ? "press a key… (Esc cancels)" : settings.controls[control].map(keyName).join(" / ") || "unbound"}
            </button>
          </div>
        ))}
      </section>

      <section style={section} aria-label="Handling">
        <strong>Handling</strong>
        <Slider label="DAS" unit="ms" min={0} max={400} step={1} value={handling.das} onChange={(das) => set("handling", { das })} />
        <Slider label="ARR" unit="ms" min={0} max={100} step={1} value={handling.arr} onChange={(arr) => set("handling", { arr })} format={(v) => (v === 0 ? "0 (instant)" : `${v} ms`)} />
        <Slider label="Soft drop" min={1} max={INSTANT_SDF} step={1} value={handling.sdf} onChange={(sdf) => set("handling", { sdf })} format={(v) => (v >= INSTANT_SDF ? "∞ (instant)" : `${v}x`)} />
      </section>

      <section style={section} aria-label="Audio">
        <strong>Audio</strong>
        <Slider label="Volume" min={0} max={100} step={5} value={Math.round(audio.volume * 100)} onChange={(v) => set("audio", { volume: v / 100 })} format={(v) => `${v}%`} />
        <Toggle label="Mute" checked={audio.muted} onChange={(muted) => set("audio", { muted })} />
      </section>

      <section style={section} aria-label="Graphics">
        <strong>Graphics</strong>
        <Toggle label="Ghost piece" checked={graphics.ghost} onChange={(ghost) => set("graphics", { ghost })} />
        <Toggle label="Grid lines" checked={graphics.grid} onChange={(grid) => set("graphics", { grid })} />
        <Toggle label="Clear text and attack animations" checked={graphics.animations} onChange={(animations) => set("graphics", { animations })} />
      </section>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button autoFocus style={buttonStyle(true)} onClick={onBack}>Done</button>
        <button style={buttonStyle()} onClick={() => onChange(structuredClone(DEFAULT_SETTINGS))}>Reset to defaults</button>
      </div>
    </div>
  );
}

function Slider({ label, unit = "", min, max, step, value, onChange, format = (v) => `${v} ${unit}` }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr", gap: 10, alignItems: "center" }}>
      <span>{label}: <span style={{ fontFamily: theme.mono }}>{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
