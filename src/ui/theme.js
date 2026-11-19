// Shared look, carried over from the original board: dark panels, thin borders, monospace HUD.
export const theme = {
  appBg: "#121216",
  boardBg: "#0d0d12",
  panel: "#12131a",
  border: "#2f2f36",
  emptyCell: "#14151d",
  grid: "rgba(255,255,255,0.035)",
  text: "#d0d2e6",
  muted: "#9ea2be",
  accent: "#1b8cff",
  danger: "#ff4757",
  warn: "#ff9f43",
  good: "#2ed573",
  button: "#20232a",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export const panelStyle = {
  background: theme.boardBg,
  color: "#f3f5ff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 24,
};

export function buttonStyle(primary = false) {
  return {
    background: primary ? theme.accent : theme.button,
    color: "#fff",
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
