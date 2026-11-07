// The base layer of edges is one bitmap, painted off the main thread. A worker draws the edges
// in view, plus diagram.edge-margin on each side, and each frame the page only moves and scales
// that bitmap. A new one is painted when the view leaves the painted area or changes detail
// level, and once zooming stops, so lines are sharp at the new scale.

import { token, num, L } from "./util.js";
import { HEAD } from "./edges.js";
import { STATUS } from "./model.js";

// paint() and withPaths() run in the worker, or here when a worker cannot start, so they must
// be self-contained.
function paint(ctx, job, lines, ink, head) {
  const { t, w, h, dpr, mx, my } = job;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * (t.x + mx), dpr * (t.y + my));
  const vx0 = (-mx - t.x) / t.k, vy0 = (-my - t.y) / t.k, vx1 = vx0 + (w + 2 * mx) / t.k, vy1 = vy0 + (h + 2 * my) / t.k;
  ctx.lineJoin = "round";
  for (const q of lines) {
    if (q.x1 < vx0 || q.x0 > vx1 || q.y1 < vy0 || q.y0 > vy1) continue;
    ctx.strokeStyle = ctx.fillStyle = ink.color[q.st] || ink.color.context;
    ctx.lineWidth = q.strong ? ink.strong : ink.width;
    ctx.lineCap = q.inferred ? "butt" : "round";
    ctx.setLineDash(q.data ? ink.data : q.inferred ? ink.inferred : []);
    ctx.stroke(q.path);
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
function withPaths(lines) {
  const add = (list) => list.map((q) => ({ ...q, path: new Path2D(q.d) }));
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
  paint(c.getContext("2d"), j, j.far ? lines.card : lines.member, ink, head);
  const bitmap = c.transferToImageBitmap();
  postMessage({ job: j, bitmap }, [bitmap]);
};`;

// What the painter needs to know about one edge: its path, its box and how to draw it.
export const toLine = (e, p) => ({
  d: p.d, tx: p.tip.x, ty: p.tip.y, dir: p.dir, ...p.box,
  st: e.status, strong: e.kind === "creates", inferred: e.resolution !== "static", data: e.kind === "reads" || e.kind === "writes",
});

function readInk() {
  const dash = (n) => token(n).split(/[\s,]+/).map(parseFloat).filter((x) => !isNaN(x));
  return {
    color: Object.fromEntries(Object.keys(STATUS).map((st) => [st, token(`color-status-${st}-solid`)])),
    width: num("diagram-edge-width"), strong: num("diagram-edge-width-strong"), headScale: num("diagram-arrow-scale-strong"),
    border: num("border-width"), inferred: dash("diagram-dash-inferred"), data: dash("diagram-dash-data"),
  };
}

// lines: { member: [...], card: [...] } from toLine(); card lines are drawn in the far view.
export function createEdgePainter(canvas, lines) {
  const out = canvas.getContext("bitmaprenderer");
  let worker = null, busy = false, again = false, shown = null, timer = 0, local = null, view = null;
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

  function job() {
    const { t, w, h, far } = view;
    return { t: { ...t }, w, h, far, dpr: devicePixelRatio || 1, mx: Math.round(w * L.edgeMargin), my: Math.round(h * L.edgeMargin) };
  }
  // True while a bitmap painted for job j covers the whole view v at v's detail level.
  function covers(j, v) {
    if (j.far !== v.far) return false;
    const px0 = (-j.mx - j.t.x) / j.t.k, py0 = (-j.my - j.t.y) / j.t.k, px1 = px0 + (j.w + 2 * j.mx) / j.t.k, py1 = py0 + (j.h + 2 * j.my) / j.t.k;
    const vx0 = -v.t.x / v.t.k, vy0 = -v.t.y / v.t.k, vx1 = vx0 + v.w / v.t.k, vy1 = vy0 + v.h / v.t.k;
    return vx0 >= px0 && vy0 >= py0 && vx1 <= px1 && vy1 <= py1;
  }
  const stale = () => !shown || !covers(shown, view) || (view.settled && shown.t.k !== view.t.k);

  function request() {
    if (worker) {
      if (busy) { again = true; return; }
      busy = true; again = false;
      worker.postMessage({ job: job() });
      return;
    }
    // No worker: paint on this thread, but only once movement has stopped.
    clearTimeout(timer);
    timer = setTimeout(async () => {
      local ??= { head: new Path2D(HEAD), lines: withPaths(lines) };
      const j = job(), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((j.w + 2 * j.mx) * j.dpr)); c.height = Math.max(1, Math.round((j.h + 2 * j.my) * j.dpr));
      paint(c.getContext("2d"), j, j.far ? local.lines.card : local.lines.member, readInk(), local.head);
      show(j, await createImageBitmap(c));
    }, L.paintDelay);
  }
  function show(j, bitmap) {
    out.transferFromImageBitmap(bitmap);
    Object.assign(canvas.style, { left: -j.mx + "px", top: -j.my + "px", width: j.w + 2 * j.mx + "px", height: j.h + 2 * j.my + "px" });
    shown = j;
    place();
  }
  // Map the bitmap, painted at shown.t, onto the current view.
  function place() {
    if (!shown) return;
    const t = view.t, s = t.k / shown.t.k;
    canvas.style.transform = `translate(${t.x + shown.mx - s * (shown.t.x + shown.mx)}px,${t.y + shown.my - s * (shown.t.y + shown.my)}px) scale(${s})`;
  }

  return {
    // v: { t: {x, y, k}, w, h, far, settled }. Call whenever the view changes.
    update(v) { view = v; place(); if (stale()) request(); },
    // The theme changed: paint again in its colours.
    restyle() { worker?.postMessage({ ink: readInk() }); if (view) request(); },
  };
}
