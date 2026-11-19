// Tiny synthesized sound effects. The AudioContext is created on first use
// (after a user gesture), and every failure is silent: audio is optional.
const SOUNDS = {
  move: [{ f: 520, d: 0.025, type: "square", g: 0.15 }],
  rotate: [{ f: 660, d: 0.03, type: "square", g: 0.15 }],
  hold: [{ f: 440, d: 0.05, type: "triangle", g: 0.3 }],
  lock: [{ f: 180, d: 0.06, type: "triangle", g: 0.4 }],
  clear: [{ f: 523, d: 0.08 }, { f: 784, d: 0.1, t: 0.06 }],
  quad: [{ f: 523, d: 0.08 }, { f: 659, d: 0.08, t: 0.06 }, { f: 1047, d: 0.16, t: 0.12 }],
  tspin: [{ f: 392, d: 0.08 }, { f: 784, d: 0.08, t: 0.05 }, { f: 1175, d: 0.16, t: 0.1 }],
  garbage: [{ f: 110, d: 0.12, type: "sawtooth", g: 0.25 }],
  countdown: [{ f: 660, d: 0.12 }],
  go: [{ f: 990, d: 0.25 }],
  win: [{ f: 523, d: 0.12 }, { f: 659, d: 0.12, t: 0.12 }, { f: 784, d: 0.12, t: 0.24 }, { f: 1047, d: 0.3, t: 0.36 }],
  lose: [{ f: 392, d: 0.2 }, { f: 311, d: 0.2, t: 0.18 }, { f: 233, d: 0.4, t: 0.36 }],
};

let ctx = null;
let settings = { volume: 0.5, muted: false };

export function setAudioSettings(next) {
  settings = next;
}

export function playSound(name) {
  if (settings.muted || settings.volume <= 0 || !SOUNDS[name]) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    for (const { f, d, t = 0, type = "sine", g = 0.35 } of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(g * settings.volume * 0.4, now + t);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    }
  } catch {
    // No audio device or API: stay silent.
  }
}
