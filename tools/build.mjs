#!/usr/bin/env node
// Build a complete OpenArc graph and a self-contained viewer page from a change directory.
//
//   node tools/build.mjs examples/rate-limit
//
// Writes  <dir>/graph.json   a conformant OpenArc graph with Klar, summaries, effects and code filled in
//         <dir>/index.html   the viewer with the graph embedded
//
// Run this way, it also rewrites viewer/tokens.css so the unbuilt viewer stays in step with
// design/. bin/openarc.mjs calls buildChange and leaves the install folder alone.
//
// tools/graph.mjs describes what the directory holds. Design checks live in tools/check.mjs.

import { writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleGraph } from "./graph.mjs";
import { buildPage } from "./page.mjs";
import { buildTokens } from "./tokens.mjs";

// Returns { problems } when the change doesn't build, otherwise the files written.
export function buildChange(dir) {
  const { graph, problems } = assembleGraph(dir);
  if (problems.length) return { problems };

  let page;
  try {
    page = buildPage(graph, dir);
  } catch (err) {
    return { problems: [err.message] };
  }
  const graphFile = join(dir, "graph.json");
  const pageFile = join(dir, "index.html");
  writeFileSync(graphFile, JSON.stringify(graph, null, 2) + "\n");
  writeFileSync(pageFile, page.html);
  return { problems: [], graphFile, pageFile, config: page.config, configFile: page.configFile };
}

export function report(result) {
  if (result.problems.length) return result.problems.map((p) => "  ✗ " + p).join("\n");
  const { theme, layoutEngine } = result.config;
  const from = result.configFile ? `from ${relative(process.cwd(), result.configFile)}` : "defaults";
  return `✓ ${result.graphFile}\n✓ ${result.pageFile} (theme: ${theme}, layout engine: ${layoutEngine}; ${from})`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tools/build.mjs <change-dir>");
    process.exit(1);
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  writeFileSync(join(root, "viewer/tokens.css"), buildTokens().css);

  const result = buildChange(dir);
  if (result.problems.length) {
    console.error(report(result));
    process.exit(1);
  }
  console.log(report(result));
}
