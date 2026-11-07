// Turn a graph into a self-contained viewer page.
//
// The page is viewer/index.html with its external parts inlined: the generated design tokens,
// the bundled viewer modules, the graph, and the ELK layout engine (or a link to it on a CDN,
// when openarc.config.json says "layoutEngine": "cdn").

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokens } from "./tokens.mjs";
import { loadConfig } from "./config.mjs";
import { bundle, checkSyntax } from "./bundle.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ELK = join(root, "vendor/elkjs");

// configDir is where the search for openarc.config.json starts.
export function buildPage(graph, configDir) {
  const { css, themes } = buildTokens();
  // Keep the unbuilt viewer's stylesheet in step with design/, too.
  writeFileSync(join(root, "viewer/tokens.css"), css);
  const { config, file: configFile } = loadConfig(configDir, { themes });

  const script = bundle(join(root, "viewer/src/main.js"));
  checkSyntax(script);
  const elkVersion = JSON.parse(readFileSync(join(ELK, "package.json"), "utf8")).version;
  const worker = config.layoutEngine === "inline"
    ? `<script id="openarc-elk" type="text/plain">${inlineSafe(readFileSync(join(ELK, "elk-worker.min.js"), "utf8"))}</script>`
    : `<script id="openarc-elk" type="text/plain" data-src="https://cdn.jsdelivr.net/npm/elkjs@${elkVersion}/lib/elk-worker.min.js"></script>`;
  // "system" leaves data-theme off so the page follows the reader's setting.
  const htmlTag = config.theme === "system" ? '<html lang="en">' : `<html lang="en" data-theme="${config.theme}">`;

  let html = readFileSync(join(root, "viewer/index.html"), "utf8");
  for (const [from, to] of [
    ['<html lang="en">', htmlTag],
    ['<link rel="stylesheet" href="tokens.css">', `<style>\n${css}</style>`],
    ['<script src="../vendor/elkjs/elk-api.js"></script>', `<script>${inlineSafe(readFileSync(join(ELK, "elk-api.js"), "utf8"))}</script>`],
    ['<script id="openarc-elk" type="text/plain" data-src="../vendor/elkjs/elk-worker.min.js"></script>', worker],
    ['<script type="module" src="src/main.js"></script>', `<script type="module">\n${inlineSafe(script)}</script>`],
    ['<script id="openarc-data" type="application/json"></script>', `<script id="openarc-data" type="application/json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`],
  ]) {
    if (!html.includes(from)) throw new Error(`viewer/index.html no longer contains ${from}`);
    html = html.replace(from, () => to);
  }
  return { html, config, configFile };
}

// Text inside a <script> element ends at the first "</script".
function inlineSafe(code) {
  if (/<\/script/i.test(code)) throw new Error("inlined script contains </script");
  return code;
}
