// Card placement. ELK arranges the cards in layers from left to right, in a worker so the page
// stays responsive while a large diagram is laid out. If the worker cannot start, ELK runs on
// this thread instead. If the layout itself fails, the error is passed on, not retried.
//
// ELK comes from vendor/elkjs: elk-api.js defines ELK on the page, and the worker source is in
// <script id="openarc-elk">, inline in a built page or fetched from its data-src.

import { $, L, type Box } from "./util.ts";

// The parts of ELK's graph format the viewer uses. elk-api.js defines ELK on the page.
interface ElkNode { id: string; width: number; height: number; x?: number; y?: number }
interface ElkGraph { id: string; layoutOptions: Record<string, string>; children: ElkNode[]; edges: { id: string; sources: string[]; targets: string[] }[] }
interface ElkLaid { children: (ElkNode & { x: number; y: number })[]; width: number; height: number }
declare const ELK: new (options: { workerFactory: () => Worker }) => { layout(graph: ElkGraph): Promise<ElkLaid>; terminateWorker(): void };

const OPTIONS: Record<string, string> = {
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
// Keeping the graph's own order makes small diagrams stable and readable, but costs about five
// times the layout time; above diagram.large-graph components ELK orders freely and sweeps less.
const SMALL = { "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES", "elk.layered.thoroughness": "7" };
const LARGE = { "elk.layered.considerModelOrder.strategy": "NONE", "elk.layered.thoroughness": "3" };

class WorkerUnavailable extends Error {}

async function workerSource(): Promise<string> {
  const el = $("#openarc-elk");
  if (el.textContent?.trim()) return el.textContent;
  const res = await fetch(el.dataset.src!);
  if (!res.ok) throw new Error(`could not load the layout engine from ${el.dataset.src} (${res.status})`);
  return res.text();
}

function inWorker(graph: ElkGraph, url: string): Promise<ElkLaid> {
  return new Promise((resolve, reject) => {
    let elk: InstanceType<typeof ELK>;
    try {
      elk = new ELK({
        workerFactory: () => {
          const w = new Worker(url);
          // ELK reports layout errors as messages, so an error event means the worker never started.
          w.addEventListener("error", (e) => { e.preventDefault(); reject(new WorkerUnavailable(e.message)); });
          return w;
        },
      });
    } catch (err) {
      return reject(new WorkerUnavailable((err as Error).message));
    }
    elk.layout(graph).then(resolve, reject).finally(() => elk.terminateWorker());
  });
}

// The worker source exports a stand-in Worker when it runs outside a worker.
function onMainThread(graph: ElkGraph, src: string): Promise<ElkLaid> {
  const module: { exports: { Worker?: new () => Worker } } = { exports: {} };
  new Function("module", "exports", src)(module, module.exports);
  return new ELK({ workerFactory: () => new module.exports.Worker!() }).layout(graph);
}

async function runElk(graph: ElkGraph): Promise<ElkLaid> {
  const src = await workerSource();
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  try {
    return await inWorker(graph, url);
  } catch (err) {
    if (!(err instanceof WorkerUnavailable)) throw err;
    return onMainThread(graph, src);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface Laid { pos: Map<string, Box>; order: string[]; width: number; height: number }

// links run between card ids. Returns each card's box, snapped to the grid, and the size of the
// whole diagram.
export async function layoutCards(cards: { id: string; w: number; h: number }[], links: { from: string; to: string }[]): Promise<Laid> {
  const laid = await runElk({
    id: "root",
    layoutOptions: { ...OPTIONS, ...(cards.length > L.largeGraph ? LARGE : SMALL) },
    children: cards.map((c) => ({ id: "c:" + c.id, width: c.w, height: c.h })),
    edges: links.map((e, i) => ({ id: "e" + i, sources: ["c:" + e.from], targets: ["c:" + e.to] })),
  });

  // Every card in a column takes the column's widest width. Columns are found by overlapping
  // x ranges; widening one shifts the columns to its right by the same amount.
  const size = new Map(cards.map((c) => [c.id, c]));
  const placed = laid.children.map((n) => ({ id: n.id.slice(2), x: n.x, y: n.y, w: size.get(n.id.slice(2))!.w })).sort((a, b) => a.x - b.x);
  const columns: { left: number; right: number; items: typeof placed }[] = [];
  for (const n of placed) {
    const col = columns.at(-1);
    if (col && n.x < col.right) { col.items.push(n); col.right = Math.max(col.right, n.x + n.w); }
    else columns.push({ left: n.x, right: n.x + n.w, items: [n] });
  }
  let shift = 0;
  for (const col of columns) {
    const w = Math.max(...col.items.map((n) => n.w));
    for (const n of col.items) { n.x = col.left + shift; n.w = w; }
    shift += w - (col.right - col.left);
  }

  const snap = (v: number) => Math.round(v / L.unit) * L.unit;
  const pos = new Map(placed.map((n) => [n.id, { x: snap(n.x), y: snap(n.y), w: n.w, h: size.get(n.id)!.h }]));
  return { pos, order: placed.map((n) => n.id), width: laid.width + shift, height: laid.height };
}
