#!/usr/bin/env node
// Check that the viewer's CSS uses design tokens rather than raw values.
//
//   node tools/lint-design.mjs
//
// Inside the viewer's <style> block it rejects colour literals (#hex, rgb(), hsl()), pixel and
// millisecond lengths, and numeric font weights. CSS custom properties cannot be used in media
// query conditions, so those are checked against the breakpoint tokens instead.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, "colour literal; use a --color-* token"],
  [/\b(?:rgb|rgba|hsl|hsla)\(/, "colour function; use a --color-* token"],
  [/(?<![\w-])\d*\.?\d+px\b/, "pixel value; use a --space-*, --radius-*, --border-* or component token"],
  [/(?<![\w-])\d*\.?\d+m?s\b/, "duration; use a --motion-duration-* token"],
  [/font-weight:\s*\d/, "font weight; use a --font-weight-* token"],
  [/font-size:|line-height:/, "font size or line height; use a .type-* class or --type-* token"],
];

export function lintDesign(file = join(root, "viewer/index.html")) {
  const html = readFileSync(file, "utf8");
  const breakpoints = Object.values(JSON.parse(readFileSync(join(root, "design/tokens/components.json"), "utf8")).breakpoint)
    .filter((t) => t?.$value).map((t) => t.$value);
  const start = html.indexOf("<style>"), end = html.indexOf("</style>", start);
  const before = html.slice(0, start).split("\n").length;
  const problems = [];
  html.slice(start + 7, end).split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\//g, "");
    const at = `viewer/index.html:${before + i}`;
    if (/^\s*@media/.test(code)) {
      for (const [, width] of code.matchAll(/width:\s*([\d.]+px)/g)) {
        if (!breakpoints.includes(width)) problems.push(`${at}: media query width ${width} is not a breakpoint token (${breakpoints.join(", ")})`);
      }
      return;
    }
    for (const [re, why] of RULES) {
      const m = code.match(re);
      if (m) problems.push(`${at}: ${why}: "${m[0]}"`);
    }
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = lintDesign();
  if (problems.length) {
    console.error(problems.map((p) => "  ✗ " + p).join("\n"));
    process.exit(1);
  }
  console.log("✓ viewer CSS uses tokens only");
}
