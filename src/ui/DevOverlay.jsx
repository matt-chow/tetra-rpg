import { useState } from "react";
import { buttonStyle, theme } from "./theme.js";

// Hidden developer panel (Shift+`). Reads the live run directly; `hud` only
// triggers the ~10 Hz refresh.
export default function DevOverlay({ run, hud, onRestartWithSeed, onClose }) {
  const [seedInput, setSeedInput] = useState(run.seed);
  const { match, bot } = run;
  const small = { ...buttonStyle(), padding: "4px 8px", fontSize: 12 };
  const plan = bot?.stats.lastPlan;

  return (
    <aside
      aria-label="Developer overlay"
      style={{
        width: 300,
        maxHeight: "90vh",
        overflowY: "auto",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 12,
        fontFamily: theme.mono,
        fontSize: 12,
        color: theme.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>DEV</strong>
        <button style={small} onClick={onClose}>close</button>
      </div>
      <Row k="seed" v={run.seed} />
      <Row k="frame" v={`${match.getFrame()} (${hud?.phase ?? run.phase})`} />

      <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
        <button style={small} onClick={() => { run.frozen = !run.frozen; }}>{run.frozen ? "unfreeze" : "freeze"}</button>
        <button style={small} disabled={!run.frozen} onClick={() => { run.stepOnce = true; }}>step frame</button>
        {bot && (
          <button style={small} disabled={!run.frozen} onClick={() => { run.untilDecision = bot.stats.decisions; }}>
            step decision
          </button>
        )}
      </div>
      <form
        style={{ display: "flex", gap: 6, marginBottom: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          onRestartWithSeed(seedInput.trim() || run.seed);
        }}
      >
        <input
          aria-label="Match seed"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          style={{ flex: 1, minWidth: 0, background: theme.boardBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 6, padding: "4px 6px", fontFamily: theme.mono }}
        />
        <button style={small} type="submit">restart w/ seed</button>
      </form>

      {match.players.map((engine, i) => {
        const s = engine.getState();
        return (
          <section key={i} style={{ borderTop: `1px solid ${theme.border}`, padding: "6px 0" }}>
            <strong>{i === 0 ? "player" : bot.profile.name}</strong>
            <Row k="hold / next" v={`${s.holdType ?? "-"} / ${s.next.join("")}`} />
            <Row k="piece" v={s.piece ? `${s.piece.type} x${s.piece.x} y${s.piece.y} r${s.piece.rot}` : "-"} />
            <Row k="incoming" v={s.incoming.map((g) => `${g.lines}${g.ready > 0 ? `(${g.ready}f)` : ""}`).join(" ") || "0"} />
            <Row k="sent / cancel / recv" v={`${s.stats.sent} / ${s.stats.cancelled} / ${s.stats.received}`} />
            <Row k="combo / b2b" v={`${s.combo} / ${s.b2b}`} />
            <Row k="lock" v={`${s.lockFrames}f, ${s.lockResets} resets`} />
          </section>
        );
      })}

      {bot && (
        <section style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 6 }}>
          <strong>AI</strong>
          <Row k="profile" v={`${bot.profile.id} d${bot.profile.depth} beam${bot.profile.beam}`} />
          <Row k="target pps" v={bot.stats.targetPps.toFixed(2)} />
          <Row k="actual pps" v={hud?.stats[1]?.pps.toFixed(2) ?? "-"} />
          <Row k="think avg / max" v={`${bot.stats.avgThinkMs.toFixed(1)} / ${bot.stats.maxThinkMs.toFixed(1)} ms`} />
          <Row k="decisions" v={`${bot.stats.decisions} (fallback ${bot.stats.fallbacks}, stale ${bot.stats.stale})`} />
          {plan && (
            <>
              <Row k="last plan" v={`${plan.target.type} x${plan.target.x} r${plan.target.rot}${plan.useHold ? " hold" : ""}${plan.mistake ? " MISTAKE" : ""}`} />
              <Row k="eval / nodes / depth" v={`${plan.score.toFixed(1)} / ${plan.nodes} / ${plan.depth}`} />
              <Row k="decided after" v={`${plan.decidedAfterFrames}f`} />
              <div style={{ color: theme.muted, marginTop: 4 }}>candidates (white = chosen)</div>
              {plan.candidates.map((c, i) => (
                <Row key={i} k={`${i + 1}. ${c.target.type} x${c.target.x} r${c.target.rot}${c.useHold ? " H" : ""}`} v={c.score.toFixed(1)} />
              ))}
            </>
          )}
        </section>
      )}
    </aside>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: theme.muted }}>{k}</span>
      <span style={{ textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}
