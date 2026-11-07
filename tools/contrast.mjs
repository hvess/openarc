#!/usr/bin/env node
// Check WCAG contrast for every colour pairing the viewer uses, in every theme.
//
//   node tools/contrast.mjs          print a report; exit 1 if any pairing fails
//
// Text needs 4.5:1. Marks, edges and de-emphasised metadata need 3:1.

import { fileURLToPath } from "node:url";
import { buildTokens } from "./tokens.mjs";

const TEXT = 4.5, UI = 3;
const SURFACES = ["color.surface.panel", "color.surface.card", "color.surface.sunken"];
const STATUSES = ["added", "changed", "removed"];

// [foreground, background, minimum, what it is]
export const PAIRS = [
  ...["primary", "secondary", "tertiary"].flatMap((t) => SURFACES.map((s) => [`color.text.${t}`, s, TEXT, `${t} text`])),
  ...SURFACES.map((s) => ["color.text.quaternary", s, UI, "metadata"]),
  ["color.text.primary", "color.canvas.bg", TEXT, "text on canvas"],
  ["color.accent.text", "color.surface.panel", TEXT, "accent text"],
  ["color.accent.text", "color.surface.selected", TEXT, "selected member"],
  ["color.text.on-accent", "color.accent.solid", TEXT, "step numbers"],
  ["color.accent.solid", "color.canvas.bg", UI, "flow path"],
  ...STATUSES.flatMap((s) => [
    [`color.status.${s}.text`, `color.status.${s}.subtle`, TEXT, `${s} pill`],
    [`color.status.${s}.text`, "color.surface.panel", TEXT, `${s} note label`],
    [`color.status.${s}.solid`, "color.surface.card", UI, `${s} mark`],
    [`color.status.${s}.solid`, "color.canvas.bg", UI, `${s} edge`],
  ]),
  ["color.status.context.text", "color.status.context.subtle", TEXT, "context pill"],
  ["color.status.context.solid", "color.canvas.bg", UI, "context edge"],
  ...["control", "declaration", "name", "value", "verb", "effect"].flatMap((k) => [
    [`color.syntax.${k}`, "color.surface.sunken", TEXT, `Klar ${k}`],
    [`color.syntax.${k}`, "color.status.added.subtle", TEXT, `Klar ${k} on an added line`],
    [`color.syntax.${k}`, "color.status.removed.subtle", TEXT, `Klar ${k} on a removed line`],
  ]),
  ["color.syntax.operator", "color.surface.sunken", UI, "Klar operator"],
  ["color.syntax.comment", "color.surface.sunken", UI, "Klar comment"],
];

export function checkContrast(colors) {
  const results = [];
  for (const [theme, map] of Object.entries(colors)) {
    for (const [fg, bg, min, what] of PAIRS) {
      const ratio = contrast(parse(map.get(fg)), parse(map.get(bg)));
      results.push({ theme, fg, bg, min, what, ratio, ok: ratio >= min });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Colour maths. Returns linear sRGB in 0..1, clipped to the sRGB gamut.

function parse(value) {
  if (!value) throw new Error("missing colour");
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => toLinear(parseInt(hex[1].slice(i, i + 2), 16) / 255));
  const ok = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (ok) return oklchToLinear(+ok[1], +ok[2], +ok[3]);
  throw new Error(`cannot parse colour ${value}`);
}
function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, c)));
}
function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = checkContrast(buildTokens().colors);
  const failed = results.filter((r) => !r.ok);
  const short = (p) => p.replace(/^color\./, "");
  for (const r of process.argv.includes("--all") ? results : failed) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.theme.padEnd(6)} ${r.ratio.toFixed(2).padStart(5)} / ${r.min}  ${r.what.padEnd(34)} ${short(r.fg)} on ${short(r.bg)}`);
  }
  console.log(`${results.length - failed.length} of ${results.length} pairings pass`);
  process.exit(failed.length ? 1 : 0);
}
