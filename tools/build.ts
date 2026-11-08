#!/usr/bin/env node
// Build a complete OpenArc graph and a self-contained viewer page from a change directory.
//
//   node tools/build.ts examples/rate-limit
//
// Writes  <dir>/graph.json   a conformant OpenArc graph with Klar, summaries, effects and code filled in
//         <dir>/index.html   the viewer with the graph embedded
//
// Run this way, it also rewrites viewer/tokens.css so the unbuilt viewer stays in step with
// design/. bin/openarc.ts calls buildChange and leaves the install folder alone.
//
// tools/graph.ts describes what the directory holds. Design checks live in tools/check.ts.

import { writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleGraph } from "./graph.ts";
import { buildPage } from "./page.ts";
import { buildTokens } from "./tokens.ts";
import { isMain } from "./is-main.ts";
import type { Config } from "./config.ts";

export type BuildResult =
  | { problems: string[] }
  | { problems: []; graphFile: string; pageFile: string; config: Config; configFile: string | null };

// Returns { problems } when the change doesn't build, otherwise the files written.
export async function buildChange(dir: string): Promise<BuildResult> {
  const { graph, problems } = assembleGraph(dir);
  if (problems.length) return { problems };

  let page: Awaited<ReturnType<typeof buildPage>>;
  try {
    page = await buildPage(graph, dir);
  } catch (err) {
    return { problems: [(err as Error).message] };
  }
  const graphFile = join(dir, "graph.json");
  const pageFile = join(dir, "index.html");
  writeFileSync(graphFile, JSON.stringify(graph, null, 2) + "\n");
  writeFileSync(pageFile, page.html);
  return { problems: [], graphFile, pageFile, config: page.config, configFile: page.configFile };
}

export function report(result: BuildResult): string {
  if (!("pageFile" in result)) return result.problems.map((p) => "  ✗ " + p).join("\n");
  const { theme, layoutEngine } = result.config;
  const from = result.configFile ? `from ${relative(process.cwd(), result.configFile)}` : "defaults";
  return `✓ ${result.graphFile}\n✓ ${result.pageFile} (theme: ${theme}, layout engine: ${layoutEngine}; ${from})`;
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tools/build.ts <change-dir>");
    process.exit(1);
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  writeFileSync(join(root, "viewer/tokens.css"), buildTokens().css);

  const result = await buildChange(dir);
  if (result.problems.length) {
    console.error(report(result));
    process.exit(1);
  }
  console.log(report(result));
}
