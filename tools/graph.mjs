// Assemble an OpenArc graph from an example directory, and check that a graph conforms
// to spec/graph.md § 10.
//
// An example directory holds
//   graph.src.json   structure: components, members, edges, flows, notes
//   change.klar      the Klar document for the change (graph.change.klar names another)
//   before/, after/  source trees before and after (graph.change.base and .head name others)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKlar } from "./klar.mjs";
import { validate } from "./schema.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA = JSON.parse(readFileSync(join(root, "spec/graph.schema.json"), "utf8"));

// Fill in each component's and member's Klar, summary and effects from the Klar document,
// and each member's code from the source trees. Returns the graph and any problems found.
export function assembleGraph(dir) {
  const graph = JSON.parse(readFileSync(join(dir, "graph.src.json"), "utf8"));
  const klar = parseKlar(readFileSync(join(dir, graph.change.klar ?? "change.klar"), "utf8"));
  const trees = { head: join(dir, graph.change.head ?? "after"), base: join(dir, graph.change.base ?? "before") };
  delete graph.change.klar;

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
      if (m.source) problems.push(...hydrate(m.source, trees.head, c.file, m.id));
      if (m.base) problems.push(...hydrate(m.base, trees.base, c.file, m.id));
    }
  }
  return { graph, problems: [...problems, ...checkGraph(graph)] };
}

// Copy an anchor's lines from its source file into anchor.code.
function hydrate(anchor, treeRoot, componentFile, id) {
  const file = anchor.file ?? componentFile;
  const path = join(treeRoot, file ?? "");
  if (!file || !existsSync(path)) return [`${id}: source file not found ${path}`];
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  const [a, b] = anchor.lines;
  if (!(a >= 1 && a <= b && b <= lines.length)) return [`${id}: lines ${a}–${b} are outside ${file}, which has ${lines.length} lines`];
  anchor.file = file;
  anchor.code ??= lines.slice(a - 1, b).join("\n");
  return [];
}

// Conformance, § 10: the graph validates against the schema (which also requires summary and
// Klar on added and changed functions, and source or base on every member), ids are unique,
// and every id an edge, flow or note refers to exists.
export function checkGraph(graph) {
  const problems = validate(graph, SCHEMA);
  if (problems.length) return problems;

  const ids = new Set();
  for (const id of graph.components.flatMap((c) => [c.id, ...c.members.map((m) => m.id)])) {
    if (ids.has(id)) problems.push(`duplicate id ${id}`);
    ids.add(id);
  }
  for (const e of graph.edges) for (const end of [e.from, e.to]) if (!ids.has(end)) problems.push(`edge ${e.from} -> ${e.to}: unknown id ${end}`);
  for (const f of graph.flows ?? []) for (const s of f.steps) if (!ids.has(s)) problems.push(`flow ${f.id}: unknown step ${s}`);
  for (const n of graph.notes ?? []) for (const r of n.refs) if (!ids.has(r)) problems.push(`note: unknown ref ${r}`);
  return problems;
}
