// Categorical slots 1–3 from the validated default palette. Deliberately
// left untouched across every reskin this app has had (Lebowski warm, then
// two neon-dark passes, now light-with-blue-accents) — this is the CVD-safe
// palette validated for actual chart data marks, and all three read fine on
// both light and dark surfaces, so there's no reason to touch it. Only
// CHART_CHROME (background/ink/gridlines) below changes with the theme.
export const CHART_COLORS = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
} as const;

// Light-mode chrome to match the current theme's white card surface (see
// --surface in styles.css) — dark ink on a light ground, low-contrast
// gridlines that stay out of the way of the data.
export const CHART_CHROME = {
  surface: "#ffffff",
  primaryInk: "#101b33",
  secondaryInk: "#3d4a68",
  mutedInk: "#5b6b8c",
  gridline: "#e4ebf7",
  axis: "#c3d1ec",
} as const;
