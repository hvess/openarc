// Card placement, without running anything: the graph ELK lays out, and how its result becomes
// card positions. The build runs ELK in Node with these, and the viewer runs it in the page when
// a page was built without a layout. Nothing here touches the DOM.

import type { Sizes } from "./sizes.ts";

// A box in diagram space.
export interface Box { x: number; y: number; w: number; h: number }

// The parts of ELK's graph format OpenArc uses. A laid-out graph is also what a built page
// carries in <script id="openarc-layout">: ELK's own positions, before the column pass below.
export interface ElkNode { id: string; width: number; height: number }
export interface ElkGraph { id: string; layoutOptions: Record<string, string>; children: ElkNode[]; edges: { id: string; sources: string[]; targets: string[] }[] }
export interface ElkLaid { children: (ElkNode & { x: number; y: number })[]; width: number; height: number }

export interface Card { id: string; w: number; h: number }
export interface Laid { pos: Map<string, Box>; order: string[]; width: number; height: number }

function options(L: Sizes): Record<string, string> {
  return {
    "elk.algorithm": "layered", "elk.direction": "RIGHT",
    "elk.layered.spacing.nodeNodeBetweenLayers": String(L.layerGap), "elk.spacing.nodeNode": String(L.nodeGap),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(L.nodeGap), "elk.spacing.componentComponent": String(L.layerGap),
    "elk.padding": `[top=${L.margin},left=${L.margin},bottom=${L.margin},right=${L.margin}]`,
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    // Lay disconnected parts (code and the docs it mentions, say) out on shared layers. Packed
    // separately, their layers don't line up, and the column pass below would merge cards from
    // different layers into one column, on top of each other.
    "elk.separateConnectedComponents": "false",
    // The viewer draws its own edges, so ELK only needs a cheap routing to space layers by.
    "elk.edgeRouting": "POLYLINE",
  };
}
// Keeping the graph's own order makes small diagrams stable and readable, but costs about five
// times the layout time; above diagram.large-graph components ELK orders freely and sweeps less.
const SMALL = { "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES", "elk.layered.thoroughness": "7" };
const LARGE = { "elk.layered.considerModelOrder.strategy": "NONE", "elk.layered.thoroughness": "3" };

// links run between card ids.
export function elkGraph(cards: Card[], links: { from: string; to: string }[], L: Sizes): ElkGraph {
  return {
    id: "root",
    layoutOptions: { ...options(L), ...(cards.length > L.largeGraph ? LARGE : SMALL) },
    children: cards.map((c) => ({ id: "c:" + c.id, width: c.w, height: c.h })),
    edges: links.map((e, i) => ({ id: "e" + i, sources: ["c:" + e.from], targets: ["c:" + e.to] })),
  };
}

// True when a laid-out graph places exactly these cards, so the viewer can use it.
export function fits(laid: ElkLaid, cards: Card[]): boolean {
  const ids = new Set(laid.children.map((n) => n.id.slice(2)));
  return ids.size === cards.length && cards.every((c) => ids.has(c.id));
}

// Each card's box, snapped to the grid, and the size of the whole diagram.
//
// Every card in a column takes the column's widest width. Columns are the layers ELK made,
// found by overlapping x ranges at the widths ELK was given; each column is then as wide as its
// widest card really is, and widening one shifts the columns to its right by the same amount.
// So the cards may be wider or narrower than ELK was told, as they are when the build estimated
// text the viewer then measured, and the layout still holds.
export function placeCards(laid: ElkLaid, cards: Card[], unit: number): Laid {
  const size = new Map(cards.map((c) => [c.id, c]));
  const placed = laid.children
    .map((n) => ({ id: n.id.slice(2), x: n.x, y: n.y, laidW: n.width, w: size.get(n.id.slice(2))!.w }))
    .sort((a, b) => a.x - b.x);
  const columns: { left: number; right: number; items: typeof placed }[] = [];
  for (const n of placed) {
    const col = columns.at(-1);
    if (col && n.x < col.right) { col.items.push(n); col.right = Math.max(col.right, n.x + n.laidW); }
    else columns.push({ left: n.x, right: n.x + n.laidW, items: [n] });
  }
  let shift = 0;
  for (const col of columns) {
    const w = Math.max(...col.items.map((n) => n.w));
    for (const n of col.items) { n.x = col.left + shift; n.w = w; }
    shift += w - (col.right - col.left);
  }

  const snap = (v: number) => Math.round(v / unit) * unit;
  const pos = new Map(placed.map((n) => [n.id, { x: snap(n.x), y: snap(n.y), w: n.w, h: size.get(n.id)!.h }]));
  return { pos, order: placed.map((n) => n.id), width: laid.width + shift, height: laid.height };
}
