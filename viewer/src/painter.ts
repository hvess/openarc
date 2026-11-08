// The canvas background, its dot grid and the base layer of edges are one opaque bitmap, painted
// off the main thread. One opaque layer is what keeps panning at full frame rate: a separate
// transparent grid and edge layer, each the size of the screen, cost the GPU half its frames on a
// large high-density display. A worker draws the view plus diagram.edge-margin on each side, and
// each frame the page only moves and scales that bitmap. A new one is painted when the view leaves
// the painted area or changes detail level, and once zooming stops, so it is sharp at the new scale.

import { token, num, L } from "./util.ts";
import { HEAD, type EdgePath } from "./edges.ts";
import { STATUSES } from "./model.ts";
import type { Edge } from "./graph.ts";

// What the painter needs to know about one edge, from toLine(). The worker adds path.
export interface Line { d: string; tx: number; ty: number; dir: number; x0: number; y0: number; x1: number; y1: number; st: string; strong: boolean; inferred: boolean; data: boolean; path?: Path2D }
export interface Lines { member: Line[]; card: Line[] }
// The colours and sizes edges and the grid are painted in, read from the tokens.
type Ink = ReturnType<typeof readInk>;
// t is the view's transform; w, h its size; mx, my the margin painted beyond it on each side.
interface Job { t: { x: number; y: number; k: number }; w: number; h: number; far: boolean; dpr: number; mx: number; my: number }
// What the view tells the painter whenever it changes.
export interface ViewState { t: { x: number; y: number; k: number }; w: number; h: number; far: boolean; moving: boolean }
export interface Painter { update(v: ViewState): void; restyle(): void }
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// paint() and withPaths() run in the worker, or here when a worker cannot start, so they must
// be self-contained.
function paint(ctx: Ctx, job: Job, lines: Line[], ink: Ink, head: Path2D): void {
  const { t, w, h, dpr, mx, my } = job;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, W, H);
  // Dots sit at multiples of grid.canvas in diagram space and keep their size on screen, so the
  // tile is drawn at screen scale and repeated. Its size is rounded to whole pixels and the pattern
  // scaled back, so dots never drift across a wide view.
  const step = ink.grid * t.k * dpr, size = Math.max(1, Math.round(step)), f = step / size;
  const tile = typeof OffscreenCanvas === "undefined" ? Object.assign(document.createElement("canvas"), { width: size, height: size }) : new OffscreenCanvas(size, size);
  const tc = tile.getContext("2d") as Ctx;
  tc.fillStyle = ink.dot;
  tc.beginPath(); tc.arc(size / 2, size / 2, (ink.dotR * dpr) / f, 0, 2 * Math.PI); tc.fill();
  const dots = ctx.createPattern(tile, "repeat")!;
  dots.setTransform(new DOMMatrix([f, 0, 0, f, dpr * (t.x + mx) - step / 2, dpr * (t.y + my) - step / 2]));
  ctx.fillStyle = dots;
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * (t.x + mx), dpr * (t.y + my));
  const vx0 = (-mx - t.x) / t.k, vy0 = (-my - t.y) / t.k, vx1 = vx0 + (w + 2 * mx) / t.k, vy1 = vy0 + (h + 2 * my) / t.k;
  ctx.lineJoin = "round";
  for (const q of lines) {
    if (q.x1 < vx0 || q.x0 > vx1 || q.y1 < vy0 || q.y0 > vy1) continue;
    ctx.strokeStyle = ctx.fillStyle = ink.color[q.st] || ink.color.context;
    ctx.lineWidth = q.strong ? ink.strong : ink.width;
    ctx.lineCap = q.inferred ? "butt" : "round";
    ctx.setLineDash(q.data ? ink.data : q.inferred ? ink.inferred : []);
    ctx.stroke(q.path!);
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(q.tx, q.ty);
    if (q.dir < 0) ctx.rotate(Math.PI);
    if (q.strong) ctx.scale(ink.headScale, ink.headScale);
    ctx.lineWidth = ink.border;
    ctx.fill(head); ctx.stroke(head);
    ctx.restore();
  }
}
function withPaths(lines: Lines): Lines {
  const add = (list: Line[]) => list.map((q) => ({ ...q, path: new Path2D(q.d) }));
  return { member: add(lines.member), card: add(lines.card) };
}

const WORKER_SRC = `const paint = ${paint};
const withPaths = ${withPaths};
let lines, ink, head;
onmessage = ({ data: m }) => {
  if (m.lines) { lines = withPaths(m.lines); head = new Path2D(m.head); }
  if (m.ink) ink = m.ink;
  if (!m.job) return;
  const j = m.job, c = new OffscreenCanvas(Math.max(1, Math.round((j.w + 2 * j.mx) * j.dpr)), Math.max(1, Math.round((j.h + 2 * j.my) * j.dpr)));
  paint(c.getContext("2d", { alpha: false }), j, j.far ? lines.card : lines.member, ink, head);
  const bitmap = c.transferToImageBitmap();
  postMessage({ job: j, bitmap }, [bitmap]);
};`;

// What the painter needs to know about one edge: its path, its box and how to draw it.
export const toLine = (e: Edge, p: EdgePath): Line => ({
  d: p.d, tx: p.tip.x, ty: p.tip.y, dir: p.dir, ...p.box,
  st: e.status, strong: e.kind === "creates", inferred: e.resolution !== "static", data: e.kind === "reads" || e.kind === "writes",
});

function readInk() {
  const dash = (n: string) => token(n).split(/[\s,]+/).map(parseFloat).filter((x) => !isNaN(x));
  return {
    color: Object.fromEntries(STATUSES.map((st) => [st, token(`color-status-${st}-solid`)])) as Record<string, string>,
    width: num("diagram-edge-width"), strong: num("diagram-edge-width-strong"), headScale: num("diagram-arrow-scale-strong"),
    border: num("border-width"), inferred: dash("diagram-dash-inferred"), data: dash("diagram-dash-data"),
    bg: token("color-canvas-bg"), dot: token("color-canvas-dot"), dotR: num("diagram-dot"), grid: num("grid-canvas"),
  };
}

// Card lines are drawn in the far view.
export function createEdgePainter(canvas: HTMLCanvasElement, lines: Lines): Painter {
  const out = canvas.getContext("bitmaprenderer", { alpha: false })!;
  let worker: Worker | null = null, busy = false, again = false, shown: Job | null = null, timer = 0;
  let local: { head: Path2D; lines: Lines } | null = null, view: ViewState | null = null;
  try {
    if (typeof OffscreenCanvas === "undefined") throw new Error("no OffscreenCanvas");
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    worker.addEventListener("error", () => { worker = null; busy = false; request(); });
    worker.addEventListener("message", ({ data }) => {
      busy = false;
      show(data.job, data.bitmap);
      if (again) { again = false; if (stale()) request(); }
    });
    worker.postMessage({ lines, head: HEAD, ink: readInk() });
  } catch {
    worker = null;
  }

  // While the view moves, paint cheaply: at diagram.edge-density-moving and with the wider
  // diagram.edge-margin-moving, so zooming out uncovers the bitmap less often. Every new bitmap is
  // a new GPU texture, so a full-density one per repaint is what made zooming drop frames.
  // Once the view is still, it is painted again at full density.
  const fullDpr = () => devicePixelRatio || 1;
  function job(): Job {
    const { t, w, h, far, moving } = view!;
    const dpr = moving ? Math.min(fullDpr(), L.edgeDensityMoving) : fullDpr(), m = moving ? L.edgeMarginMoving : L.edgeMargin;
    return { t: { ...t }, w, h, far, dpr, mx: Math.round(w * m), my: Math.round(h * m) };
  }
  // True while a bitmap painted for job j covers the whole view v at v's detail level.
  function covers(j: Job, v: ViewState): boolean {
    if (j.far !== v.far) return false;
    const px0 = (-j.mx - j.t.x) / j.t.k, py0 = (-j.my - j.t.y) / j.t.k, px1 = px0 + (j.w + 2 * j.mx) / j.t.k, py1 = py0 + (j.h + 2 * j.my) / j.t.k;
    const vx0 = -v.t.x / v.t.k, vy0 = -v.t.y / v.t.k, vx1 = vx0 + v.w / v.t.k, vy1 = vy0 + v.h / v.t.k;
    return vx0 >= px0 && vy0 >= py0 && vx1 <= px1 && vy1 <= py1;
  }
  const stale = () => !shown || !covers(shown, view!) || (!view!.moving && (shown.t.k !== view!.t.k || shown.dpr !== fullDpr()));

  function request(): void {
    if (worker) {
      if (busy) { again = true; return; }
      busy = true; again = false;
      worker.postMessage({ job: job() });
      return;
    }
    // No worker: paint on this thread, but only once movement has stopped.
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      local ??= { head: new Path2D(HEAD), lines: withPaths(lines) };
      const j = job(), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((j.w + 2 * j.mx) * j.dpr)); c.height = Math.max(1, Math.round((j.h + 2 * j.my) * j.dpr));
      paint(c.getContext("2d", { alpha: false })!, j, j.far ? local.lines.card : local.lines.member, readInk(), local.head);
      show(j, await createImageBitmap(c));
    }, L.paintDelay);
  }
  function show(j: Job, bitmap: ImageBitmap): void {
    out.transferFromImageBitmap(bitmap);
    Object.assign(canvas.style, { left: -j.mx + "px", top: -j.my + "px", width: j.w + 2 * j.mx + "px", height: j.h + 2 * j.my + "px" });
    shown = j;
    place();
  }
  // Map the bitmap, painted at shown.t, onto the current view.
  function place(): void {
    if (!shown || !view) return;
    const t = view.t, s = t.k / shown.t.k;
    canvas.style.transform = `translate(${t.x + shown.mx - s * (shown.t.x + shown.mx)}px,${t.y + shown.my - s * (shown.t.y + shown.my)}px) scale(${s})`;
  }

  return {
    // v: { t: {x, y, k}, w, h, far, moving }. Call whenever the view changes.
    update(v) { view = v; place(); if (stale()) request(); },
    // The theme changed: paint again in its colours.
    restyle() { worker?.postMessage({ ink: readInk() }); if (view) request(); },
  };
}
