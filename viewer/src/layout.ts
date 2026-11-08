// Card placement. A built page normally carries its layout: the build ran ELK and put the result
// in <script id="openarc-layout">, so the page only fits the cards to the widths it measures.
// Otherwise, as in the unbuilt viewer, ELK runs here, in a worker so the page stays responsive
// while a large diagram is laid out. If the worker cannot start, ELK runs on this thread
// instead. If the layout itself fails, the error is passed on, not retried.
//
// ELK comes from vendor/elkjs: elk-api.js defines ELK on the page, and the worker source is in
// <script id="openarc-elk">, inline in a built page or fetched from its data-src.

import { $, L } from "./util.ts";
import { elkGraph, fits, placeCards, type Card, type ElkGraph, type ElkLaid, type Laid } from "./place.ts";

declare const ELK: new (options: { workerFactory: () => Worker }) => { layout(graph: ElkGraph): Promise<ElkLaid>; terminateWorker(): void };

class WorkerUnavailable extends Error {}

async function workerSource(): Promise<string> {
  const el = $("#openarc-elk");
  if (el.textContent?.trim()) return el.textContent;
  // A page built with "layoutEngine": "build" carries its layout and no engine.
  if (!el.dataset.src) throw new Error("this page has no layout for its cards and no layout engine; build it again");
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

// The layout the build made, if this page has one for these cards.
function builtLayout(cards: Card[]): ElkLaid | null {
  const text = $("#openarc-layout").textContent?.trim();
  if (!text) return null;
  const laid: ElkLaid = JSON.parse(text);
  return fits(laid, cards) ? laid : null;
}

// links run between card ids. Returns each card's box and the size of the whole diagram.
export async function layoutCards(cards: Card[], links: { from: string; to: string }[]): Promise<Laid> {
  const laid = builtLayout(cards) ?? await runElk(elkGraph(cards, links, L));
  return placeCards(laid, cards, L.unit);
}
