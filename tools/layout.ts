// Lay a graph out at build time, so a built page needs neither the layout engine nor the second
// or so it takes to run on a large diagram.
//
// ELK runs here with the graph the viewer would give it (viewer/src/place.ts), and the page
// carries ELK's result. Card heights come from the tokens, so they are exact. Widths depend on
// text, which Node cannot measure, so they are estimated from the fonts' average character
// width; the viewer measures the real widths and fits each column to them (placeCards), so an
// estimate that is a little off moves nothing but the columns' widths.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sizesFrom } from "../viewer/src/sizes.ts";
import { indexGraph } from "../viewer/src/model.ts";
import { cardHeight, cardWidth, type Measure, type Role } from "../viewer/src/card-size.ts";
import { elkGraph, type ElkGraph, type ElkLaid } from "../viewer/src/place.ts";
import type { Graph } from "../viewer/src/graph.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

// Average advance per character, in ems. JetBrains Mono is monospaced at 0.6 em; Inter, which
// headings use, averages about 0.54 em on identifiers, so 0.55 errs on the wide side.
const EM: Record<Role, number> = { heading: 0.55, "code-strong": 0.6, "code-sm": 0.6, "code-meta": 0.6 };

interface ElkApi { layout(graph: ElkGraph): Promise<ElkLaid> }
type ElkConstructor = new (options: { workerFactory: () => unknown }) => ElkApi;

// values: the page's custom properties, from buildTokens().values.
export async function layoutGraph(graph: Graph, values: Map<string, string>): Promise<ElkLaid> {
  const token = (name: string) => {
    const v = values.get(name);
    if (v === undefined) throw new Error(`layout: no design token --${name}`);
    return v;
  };
  const num = (name: string) => parseFloat(token(name));
  const L = sizesFrom(num);

  const measure: Measure = (role, text) => {
    const size = num(`type-${role}-size`), tracking = (parseFloat(token(`type-${role}-tracking`)) || 0) * size;
    return text.length * (EM[role] * size + tracking);
  };

  // indexGraph links each member to its component, so it gets a copy, not the graph the build
  // writes out.
  const model = indexGraph(structuredClone(graph));
  const cards = graph.components.map((c) => ({ id: c.id, w: cardWidth(c, L, measure), h: cardHeight(c, L) }));

  // The worker source exports a stand-in Worker when it runs outside a worker, as it does here.
  const { Worker } = require(join(root, "vendor/elkjs/elk-worker.min.js")) as { Worker: new () => unknown };
  const ELK = require(join(root, "vendor/elkjs/elk-api.js")) as ElkConstructor;
  const laid = await new ELK({ workerFactory: () => new Worker() }).layout(elkGraph(cards, model.cardEdges, L));

  // Only what the viewer reads, rounded: positions are snapped to the grid anyway.
  return {
    width: Math.round(laid.width), height: Math.round(laid.height),
    children: laid.children.map(({ id, x, y, width, height }) => ({ id, x: Math.round(x), y: Math.round(y), width, height })),
  };
}
