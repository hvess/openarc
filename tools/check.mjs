#!/usr/bin/env node
// Check the design system: the viewer's CSS uses tokens only, and every colour pairing meets
// its WCAG contrast minimum in every theme. Exits 1 on any problem.
//
//   node tools/check.mjs

import { lintDesign } from "./lint-design.mjs";
import { checkContrast } from "./contrast.mjs";
import { buildTokens } from "./tokens.mjs";

const tokens = buildTokens();
const contrast = checkContrast(tokens);
const problems = [
  ...lintDesign(),
  ...contrast.filter((r) => !r.ok).map((r) => `${r.theme} theme: ${r.what} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1 (${r.fg} on ${r.bg})`),
];
if (problems.length) {
  console.error(problems.map((p) => "  ✗ " + p).join("\n"));
  process.exit(1);
}
console.log(`✓ viewer CSS uses tokens only\n✓ ${contrast.length} colour pairings meet their contrast minimum (themes: ${tokens.themes.join(", ")})`);
