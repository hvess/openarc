#!/usr/bin/env node
// Check the design system: the viewer's CSS uses tokens only, every colour pairing meets its
// WCAG contrast minimum in every theme, and viewer/tokens.css matches design/. Exits 1 on any
// problem.
//
//   node tools/check.ts

import { lintDesign } from "./lint-design.ts";
import { checkContrast } from "./contrast.ts";
import { readFileSync } from "node:fs";
import { buildTokens } from "./tokens.ts";

const tokens = buildTokens();
const contrast = checkContrast(tokens);
const problems = [
  ...lintDesign(),
  ...(readFileSync(new URL("../viewer/tokens.css", import.meta.url), "utf8") === tokens.css
    ? []
    : ["viewer/tokens.css is out of date with design/; run node tools/tokens.ts"]),
  ...contrast.filter((r) => !r.ok).map((r) => `${r.theme} theme: ${r.what} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1 (${r.fg} on ${r.bg})`),
];
if (problems.length) {
  console.error(problems.map((p) => "  ✗ " + p).join("\n"));
  process.exit(1);
}
console.log(`✓ viewer CSS uses tokens only\n✓ viewer/tokens.css matches design/\n✓ ${contrast.length} colour pairings meet their contrast minimum (themes: ${tokens.themes.join(", ")})`);
