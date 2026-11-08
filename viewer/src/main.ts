// The OpenArc viewer. Loads a graph, lays its cards out, and wires up selection, flows and notes.
//
// The graph comes from <script id="openarc-data"> in a built page, or from ?src= (default
// graph.json) in the unbuilt viewer.

import { $, $$, L, closest } from "./util.ts";
import { indexGraph, type Model } from "./model.ts";
import { renderSide } from "./sidebar.ts";
import { loadFonts, cardWidth, cardHeight, cardHTML } from "./cards.ts";
import { layoutCards, type Laid } from "./layout.ts";
import { createGeometry, headAt, edgeHTML } from "./edges.ts";
import { createEdgePainter, toLine } from "./painter.ts";
import { createView } from "./view.ts";
import { createKlar } from "./klar.ts";
import { createInspector } from "./inspector.ts";
import type { Graph } from "./graph.ts";

const app = $("#app"), side = $("#side"), stage = $("#stage"), world = $("#world"), nodesEl = $("#nodes");
const drawer = $("#drawer"), loading = $("#loading");

async function loadGraph(): Promise<Graph> {
  const inline = $("#openarc-data").textContent?.trim();
  if (inline) return JSON.parse(inline);
  const src = new URLSearchParams(location.search).get("src") || "graph.json";
  const res = await fetch(src);
  if (!res.ok) throw new Error(`could not load ${src} (${res.status})`);
  return res.json();
}

let model: Model, laid: Laid;
try {
  model = indexGraph(await loadGraph());
  document.title = `${model.G.change.title} · OpenArc`;
  renderSide(side, model);
  await loadFonts();
  const cards = model.G.components.map((c) => ({ id: c.id, w: cardWidth(c), h: cardHeight(c) }));
  laid = await layoutCards(cards, model.cardEdges);
} catch (err) {
  loading.textContent = `The diagram could not be shown: ${(err as Error).message}`;
  loading.classList.add("failed");
  throw err;
}
loading.remove();
const { G, comps, members, compOf, edges, cardEdges, relatedEdges } = model;
const { pos } = laid;

nodesEl.innerHTML = laid.order.map((id) => cardHTML(comps.get(id)!, pos.get(id)!)).join("");

// ---------- edges ----------
const pathBetween = createGeometry(model, pos);
const paths = edges.map((e) => pathBetween(e.from, e.to));
const painter = createEdgePainter($<HTMLCanvasElement>("#edges"), {
  member: edges.map((e, i) => toLine(e, paths[i])),
  card: cardEdges.map((e) => toLine(e, pathBetween(e.from, e.to))),
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => painter.restyle());

const overlay = $<SVGSVGElement>("#overlay");
overlay.setAttribute("width", String(laid.width)); overlay.setAttribute("height", String(laid.height));
overlay.innerHTML = `<g id="hlLayer"></g><g id="hovLayer"></g><g id="flowLayer"></g>`;
const hlLayer = $<SVGGElement>("#hlLayer"), hovLayer = $<SVGGElement>("#hovLayer"), flowLayer = $<SVGGElement>("#flowLayer");
const edgeMarkup = (i: number, cls: string) => edgeHTML(edges[i], paths[i], cls);

const view = createView({
  stage, world, pct: $(".pct"), drawer, zoombar: $(".zoombar"), painter,
  size: { width: laid.width, height: laid.height },
});
const focusIds = (ids: string[]) => view.focus(ids.map((id) => pos.get(compOf(id)?.id ?? "")).filter((b) => b !== undefined));

const inspector = createInspector(drawer, app, model, createKlar(model));

// ---------- selection, flows, notes ----------
// One thing is in focus at a time: a selected card or member, a flow, or a note. highlight()
// works out what that lights up and changes only the elements whose state differs from before.
const S: { sel: string | null; flow: string | null; note: number | null } = { sel: null, flow: null, note: null };
const rowEls = new Map($$(".row, .card-head", nodesEl).map((el) => [el.dataset.id!, { el, step: $(".step", el) }]));
const cardEls = new Map($$(".card", nodesEl).map((el) => [el.dataset.c!, el]));
const flowEls = $$(".flow", side), noteEls = $$(".note[data-note]", side);
interface Lit { rows: Set<HTMLElement>; sel: Set<HTMLElement>; cards: Set<HTMLElement>; selc: Set<HTMLElement>; steps: Map<HTMLElement, string> }
let lit: Lit = { rows: new Set(), sel: new Set(), cards: new Set(), selc: new Set(), steps: new Map() };

function swap(before: Set<HTMLElement>, after: Set<HTMLElement>, cls: string): void {
  for (const el of before) if (!after.has(el)) el.classList.remove(cls);
  for (const el of after) if (!before.has(el)) el.classList.add(cls);
}

function highlight(): void {
  const nodes = new Set<string>(), hlEdges = new Set<number>(), steps = new Map<string, number>();
  flowLayer.innerHTML = "";
  if (S.flow) {
    const f = G.flows!.find((x) => x.id === S.flow)!;
    f.steps.forEach((s, i) => { nodes.add(s); if (!steps.has(s)) steps.set(s, i + 1); });
    const segs = f.steps.slice(1).map((s, i) => pathBetween(f.steps[i], s));
    flowLayer.innerHTML = `<path class="flowpath" d="${segs.map((x) => x.d).join(" ")}"/><g class="flowheads">${segs.map(headAt).join("")}</g>`;
  }
  if (S.note != null) for (const r of G.notes![S.note].refs) { nodes.add(r); relatedEdges(r).forEach((e) => hlEdges.add(e.i)); }
  const sel = S.sel;
  if (sel) {
    nodes.add(sel);
    comps.get(sel)?.members.forEach((m) => nodes.add(m.id));
    for (const e of relatedEdges(sel)) { hlEdges.add(e.i); nodes.add(e.from); nodes.add(e.to); }
  }

  const next: Lit = {
    rows: new Set([...nodes].map((id) => rowEls.get(id)?.el).filter((el) => el !== undefined)),
    sel: new Set(sel && members.has(sel) ? [rowEls.get(sel)!.el] : []),
    cards: new Set([...nodes].map((id) => cardEls.get(compOf(id)?.id ?? "")).filter((el) => el !== undefined)),
    selc: new Set(sel && comps.has(sel) ? [cardEls.get(sel)!] : []),
    steps: new Map([...steps].filter(([id]) => rowEls.has(id)).map(([id, n]) => [rowEls.get(id)!.step, String(n)])),
  };
  swap(lit.rows, next.rows, "hl");
  swap(lit.sel, next.sel, "sel");
  swap(lit.cards, next.cards, "hl");
  swap(lit.selc, next.selc, "selc");
  for (const el of lit.steps.keys()) if (!next.steps.has(el)) { el.textContent = ""; el.classList.remove("on"); }
  for (const [el, n] of next.steps) { el.textContent = n; el.classList.add("on"); }
  lit = next;

  app.classList.toggle("focus", nodes.size > 0);
  hlLayer.innerHTML = [...hlEdges].map((i) => edgeMarkup(i, "hl")).join("");
  for (const b of flowEls) b.classList.toggle("on", b.dataset.flow === S.flow);
  for (const b of noteEls) b.classList.toggle("on", Number(b.dataset.note) === S.note);
}

function select(id: string | null, { pan = true } = {}): void {
  S.sel = id;
  highlight();
  if (!id) return inspector.close();
  inspector.open(id);
  if (pan || hiddenByDrawer(id)) focusIds([id]);
}
function clear(): void {
  S.flow = null; S.note = null;
  select(null);
}
function hiddenByDrawer(id: string): boolean {
  const r = cardEls.get(compOf(id)!.id)!.getBoundingClientRect(), s = stage.getBoundingClientRect(), v = view.visible();
  return r.right > s.left + v.w - L.padX || r.bottom > s.top + v.h - L.padX || r.left < s.left || r.top < s.top;
}

nodesEl.addEventListener("click", (e) => {
  if (view.wasDragged()) return;
  const el = closest(e, "[data-id]");
  if (el) select(el.dataset.id!, { pan: false });
});
stage.addEventListener("click", (e) => {
  if (view.wasDragged() || closest(e, "[data-id], #drawer, .zoombar, #sideToggle")) return;
  clear();
});
drawer.addEventListener("click", (e) => {
  if (closest(e, ".x")) { S.note = null; select(null); return; }
  const g = closest(e, "[data-goto]");
  if (g) { S.note = null; select(g.dataset.goto!); }
});

// Hover draws the related edges again, thicker, on the overlay. Nothing else is restyled, and
// nothing happens while the canvas is being dragged across cards.
let hovId: string | null = null;
function hover(id: string | null): void {
  if (id === hovId) return;
  hovId = id;
  hovLayer.innerHTML = id ? relatedEdges(id).map((e) => edgeMarkup(e.i, "hov")).join("") : "";
}
nodesEl.addEventListener("pointerover", (e) => { if (!view.isDragging()) hover(closest(e, "[data-id]")?.dataset.id ?? null); });
nodesEl.addEventListener("pointerleave", () => hover(null));

side.addEventListener("click", (e) => {
  const f = closest(e, "[data-flow]"), n = closest(e, "[data-note]");
  if (f) {
    S.flow = S.flow === f.dataset.flow ? null : f.dataset.flow!; S.note = null; S.sel = null;
    inspector.close(); highlight();
    if (S.flow) focusIds(G.flows!.find((x) => x.id === S.flow)!.steps);
  }
  if (n) {
    const i = Number(n.dataset.note);
    S.note = S.note === i ? null : i; S.flow = null; S.sel = null; highlight();
    if (S.note != null) { inspector.open(G.notes![i].refs[0]); focusIds(G.notes![i].refs); } else inspector.close();
  }
  if (f || n) app.classList.remove("side-open");
});
$("#sideToggle").addEventListener("click", () => app.classList.toggle("side-open"));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !closest(e, "input, textarea")) clear();
});

view.fit(false);
