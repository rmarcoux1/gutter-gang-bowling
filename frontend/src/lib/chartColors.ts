// Categorical slots 1–3 from the validated default palette (light mode —
// this app is light-only, see styles.css), plus chart chrome tokens.
export const CHART_COLORS = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
} as const;

export const CHART_CHROME = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  gridline: "#e1e0d9",
  axis: "#c3c2b7",
} as const;
