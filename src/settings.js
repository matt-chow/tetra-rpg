// Player settings persisted in localStorage. Every read and write is wrapped:
// storage can be missing or blocked, and the game must still run on defaults.
const STORAGE_KEY = "tetra-rpg:settings:v1";

export const CONTROL_LABELS = {
  left: "Move left",
  right: "Move right",
  softDrop: "Soft drop",
  hardDrop: "Hard drop",
  rotateCW: "Rotate clockwise",
  rotateCCW: "Rotate counter-clockwise",
  rotate180: "Rotate 180",
  hold: "Hold",
  pause: "Pause",
  reset: "Restart",
};

export const DEFAULT_SETTINGS = {
  // Key codes (KeyboardEvent.code), several per control.
  controls: {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    softDrop: ["ArrowDown"],
    rotateCW: ["ArrowUp", "KeyX"],
    rotateCCW: ["KeyZ"],
    rotate180: ["KeyA"],
    hardDrop: ["Space"],
    hold: ["KeyC"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"],
  },
  // Milliseconds; sdf is a gravity multiplier, 41 or more means instant (sonic) soft drop.
  handling: { das: 150, arr: 33, sdf: 20 },
  audio: { volume: 0.5, muted: false },
  graphics: { ghost: true, grid: true, animations: true },
};

export const INSTANT_SDF = 41;

function merge(defaults, saved) {
  if (!saved || typeof saved !== "object") return structuredClone(defaults);
  const out = {};
  for (const [key, value] of Object.entries(defaults)) {
    const s = saved[key];
    if (Array.isArray(value)) out[key] = Array.isArray(s) ? s.filter((v) => typeof v === "string") : [...value];
    else if (value && typeof value === "object") out[key] = merge(value, s);
    else out[key] = typeof s === typeof value ? s : value;
  }
  return out;
}

export function loadSettings() {
  try {
    return merge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// code -> [control, ...] lookup for keyboard handlers.
export function keyMap(controls) {
  const map = {};
  for (const [control, codes] of Object.entries(controls)) {
    for (const code of codes) (map[code] ??= []).push(control);
  }
  return map;
}

export { merge as mergeSettings };
