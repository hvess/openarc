#!/usr/bin/env node
// Build a complete OpenArc graph and a self-contained viewer page from an example directory.
//
//   node tools/build.mjs examples/rate-limit
//
// Writes  <dir>/graph.json   a conformant OpenArc graph with Klar, summaries, effects and code filled in
//         <dir>/index.html   the viewer with the graph embedded
//
// tools/graph.mjs describes what the directory holds. Design checks live in tools/check.mjs.

import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { assembleGraph } from "./graph.mjs";
import { buildPage } from "./page.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools/build.mjs <example-dir>");
  process.exit(1);
}

const fail = (problems) => {
  console.error(problems.map((p) => "  ✗ " + p).join("\n"));
  process.exit(1);
};

const { graph, problems } = assembleGraph(dir);
if (problems.length) fail(problems);
writeFileSync(join(dir, "graph.json"), JSON.stringify(graph, null, 2) + "\n");

let page;
try {
  page = buildPage(graph, dir);
} catch (err) {
  fail([err.message]);
}
writeFileSync(join(dir, "index.html"), page.html);

const { theme, layoutEngine } = page.config;
const from = page.configFile ? `from ${relative(process.cwd(), page.configFile)}` : "defaults";
console.log(`✓ ${join(dir, "graph.json")}\n✓ ${join(dir, "index.html")} (theme: ${theme}, layout engine: ${layoutEngine}; ${from})`);
