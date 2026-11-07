#!/usr/bin/env node
// Build a complete OpenArc graph and a self-contained viewer page from an example directory.
//
//   node tools/build.mjs examples/rate-limit
//
// Reads   <dir>/graph.src.json   structure (components, members, edges, flows, notes)
//         <dir>/<change.klar>    the Klar document for the change
//         <dir>/<base>, <head>   source trees before and after the change
// Writes  <dir>/graph.json       a conformant OpenArc graph with klar, summaries, effects and code filled in
//         <dir>/index.html       the viewer with the graph embedded

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools/build.mjs <example-dir>");
  process.exit(1);
}

const graph = JSON.parse(readFileSync(join(dir, "graph.src.json"), "utf8"));
const klar = parseKlar(readFileSync(join(dir, graph.change.klar ?? "change.klar"), "utf8"));
const headRoot = join(dir, graph.change.head ?? "after");
const baseRoot = join(dir, graph.change.base ?? "before");

const problems = [];
for (const c of graph.components) {
  const kc = klar.get(c.name);
  if (kc) {
    if (kc.doc) c.summary ??= kc.doc;
    if (kc.header.length > 1) c.klar ??= kc.header.join("\n");
  }
  for (const m of c.members) {
    const km = kc?.members.get(m.name);
    if (km) {
      m.klar ??= km.lines.join("\n");
      if (km.effects) m.effects ??= km.effects;
      if (km.baseEffects) m.baseEffects ??= km.baseEffects;
    } else if (m.status !== "context") {
      problems.push(`${m.id}: no Klar block found`);
    }
    if (m.source) hydrate(m.source, headRoot, c.file, m.id);
    if (m.base) hydrate(m.base, baseRoot, c.file, m.id);
  }
}

// Every edge endpoint must name a component or member.
const ids = new Set(graph.components.flatMap((c) => [c.id, ...c.members.map((m) => m.id)]));
for (const e of graph.edges) for (const end of [e.from, e.to]) if (!ids.has(end)) problems.push(`edge ${e.from} -> ${e.to}: unknown id ${end}`);
for (const f of graph.flows ?? []) for (const s of f.steps) if (!ids.has(s)) problems.push(`flow ${f.id}: unknown step ${s}`);
for (const n of graph.notes ?? []) for (const r of n.refs) if (!ids.has(r)) problems.push(`note: unknown ref ${r}`);

if (problems.length) {
  console.error(problems.map((p) => "  ✗ " + p).join("\n"));
  process.exit(1);
}

delete graph.change.klar;
writeFileSync(join(dir, "graph.json"), JSON.stringify(graph, null, 2) + "\n");

const template = readFileSync(join(root, "viewer/index.html"), "utf8");
const embedded = JSON.stringify(graph).replace(/</g, "\\u003c");
const page = template.replace(
  '<script id="openarc-data" type="application/json"></script>',
  `<script id="openarc-data" type="application/json">${embedded}</script>`,
);
writeFileSync(join(dir, "index.html"), page);
console.log(`✓ ${join(dir, "graph.json")}\n✓ ${join(dir, "index.html")}`);

// ---------------------------------------------------------------------------

function hydrate(anchor, treeRoot, componentFile, id) {
  const file = anchor.file ?? componentFile;
  const path = join(treeRoot, file);
  if (!existsSync(path)) return problems.push(`${id}: source file not found ${path}`);
  const lines = readFileSync(path, "utf8").split("\n");
  const [a, b] = anchor.lines;
  anchor.file = file;
  anchor.code ??= lines.slice(a - 1, b).join("\n");
}

// A deliberately small reader for Klar 0.2 documents: enough to pull out each
// component's header and each member's block, and the effects footer that
// follows a blank line in a member. Not a validating parser.
function parseKlar(text) {
  const comps = new Map();
  let comp = null, member = null;
  for (const raw of text.split("\n")) {
    const body = raw.slice(2);
    const content = body.trim();
    const indent = body.length - body.trimStart().length;
    if (!content) { if (member) member.lines.push(""); continue; }
    if (indent === 0) {
      const m = content.match(/^(class|module|interface|record|enum|external)\s+([\w.]+)/);
      comp = m ? { name: m[2], header: [raw], doc: null, members: new Map() } : null;
      if (comp) comps.set(comp.name, comp);
      member = null;
      continue;
    }
    if (!comp) continue;
    if (indent === 2) {
      if (content.startsWith("needs ")) { comp.header.push(raw); member = null; continue; }
      const m = content.match(/^(?:private\s+)?(?:(const|state)\s+)?([A-Za-z_][\w.]*)/);
      if (!m) { member = null; continue; }
      if (m[1] === "state") comp.header.push(raw);
      member = { name: m[2], lines: [dedent(raw)] };
      comp.members.set(m[2], member);
      continue;
    }
    if (member) member.lines.push(dedent(raw));
  }
  for (const c of comps.values()) for (const m of c.members.values()) {
    while (m.lines.length && !m.lines.at(-1).trim()) m.lines.pop();
    const blank = m.lines.findIndex((l) => !l.trim());
    if (blank < 0) continue;
    const now = [], was = [];
    for (const l of m.lines.slice(blank + 1)) {
      const items = l.slice(2).split("·").map((s) => s.trim()).filter((s) => s && s !== "no effects");
      if (l[0] !== "+") was.push(...items);
      if (l[0] !== "-") now.push(...items);
    }
    m.effects = now;
    if (now.join() !== was.join()) m.baseEffects = was;
  }
  return comps;
}

function dedent(raw) {
  return raw.slice(0, 2) + raw.slice(4);
}
