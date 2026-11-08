// Turn a graph into a self-contained viewer page.
//
// The page is viewer/index.html with its external parts inlined: the generated design tokens,
// the bundled viewer modules, the graph and, as openarc.config.json's "layoutEngine" says,
// either its layout ("build", the default) or the ELK layout engine to make one when the page
// opens ("inline" embeds ELK; "cdn" links to it).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokens } from "./tokens.ts";
import { loadConfig, type Config } from "./config.ts";
import { bundle, checkSyntax } from "./bundle.ts";
import { layoutGraph } from "./layout.ts";
import type { Graph } from "../viewer/src/graph.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ELK = join(root, "vendor/elkjs");

// JSON inside a <script> element, where "</script" would end it early.
const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

// configDir is where the search for openarc.config.json starts.
export async function buildPage(graph: Graph, configDir: string): Promise<{ html: string; config: Config; configFile: string | null }> {
  const { css, themes, values } = buildTokens();
  const { config, file: configFile } = loadConfig(configDir, { themes });

  const script = bundle(join(root, "viewer/src/main.ts"));
  checkSyntax(script);

  let layout = "", elkApi = "", worker = '<script id="openarc-elk" type="text/plain"></script>';
  if (config.layoutEngine === "build") {
    layout = json(await layoutGraph(graph, values));
  } else {
    elkApi = `<script>${inlineSafe(readFileSync(join(ELK, "elk-api.js"), "utf8"))}</script>`;
    const elkVersion = JSON.parse(readFileSync(join(ELK, "package.json"), "utf8")).version;
    worker = config.layoutEngine === "inline"
      ? `<script id="openarc-elk" type="text/plain">${inlineSafe(readFileSync(join(ELK, "elk-worker.min.js"), "utf8"))}</script>`
      : `<script id="openarc-elk" type="text/plain" data-src="https://cdn.jsdelivr.net/npm/elkjs@${elkVersion}/lib/elk-worker.min.js"></script>`;
  }
  // "system" leaves data-theme off so the page follows the reader's setting.
  const htmlTag = config.theme === "system" ? '<html lang="en">' : `<html lang="en" data-theme="${config.theme}">`;

  let html = readFileSync(join(root, "viewer/index.html"), "utf8");
  for (const [from, to] of [
    ['<html lang="en">', htmlTag],
    ['<link rel="stylesheet" href="tokens.css">', `<style>\n${css}</style>`],
    ['<script src="../vendor/elkjs/elk-api.js"></script>\n', elkApi && elkApi + "\n"],
    ['<script id="openarc-elk" type="text/plain" data-src="../vendor/elkjs/elk-worker.min.js"></script>', worker],
    ['<script type="module" src="src/main.ts"></script>', `<script type="module">\n${inlineSafe(script)}</script>`],
    ['<script id="openarc-data" type="application/json"></script>', `<script id="openarc-data" type="application/json">${json(graph)}</script>`],
    ['<script id="openarc-layout" type="application/json"></script>', `<script id="openarc-layout" type="application/json">${layout}</script>`],
  ]) {
    if (!html.includes(from)) throw new Error(`viewer/index.html no longer contains ${from}`);
    html = html.replace(from, () => to);
  }
  return { html, config, configFile };
}

// Text inside a <script> element ends at the first "</script".
function inlineSafe(code: string): string {
  if (/<\/script/i.test(code)) throw new Error("inlined script contains </script");
  return code;
}
