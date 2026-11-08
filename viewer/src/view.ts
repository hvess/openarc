// The camera: pan, zoom, fit and focus. Input can arrive faster than the screen refreshes, so it
// is coalesced into one write per frame. The stage's box is cached and only read again when it
// resizes, so a frame never forces the browser to recalculate layout.

import { L, narrow, closest, type Box } from "./util.ts";
import type { Painter } from "./painter.ts";

export interface ViewParts {
  stage: HTMLElement; world: HTMLElement; pct: HTMLElement; drawer: HTMLElement; zoombar: HTMLElement;
  painter: Painter;
  // The diagram's size.
  size: { width: number; height: number };
}
export interface View {
  fit(animate?: boolean): void;
  focus(boxes: Box[]): void;
  visible(): { w: number; h: number };
  wasDragged(): boolean;
  isDragging(): boolean;
}

export function createView({ stage, world, pct, drawer, zoombar, painter, size }: ViewParts): View {
  const T = { x: 0, y: 0, k: 1 };
  let box = stage.getBoundingClientRect();
  let queued = false, settledK: number | null = null, settleTimer = 0, moving = false, far = false;
  // While the view is where fit() put it, a resize fits again; after the reader moves it, a
  // resize keeps the middle of the view in the middle.
  let fitted = true;

  const clampK = (k: number) => Math.min(L.zoomMax, Math.max(L.zoomMin, k));
  const frame = () => painter.update({ t: T, w: box.width, h: box.height, far, moving });

  function apply() {
    if (!queued) { queued = true; requestAnimationFrame(render); }
  }
  // A frame only moves layers the GPU already has. Anything that needs redrawing (the zoom
  // label, text at a new scale, sharp edges) waits until the view has been still for
  // diagram.settle-delay, so nothing is rastered while it moves.
  function render() {
    queued = false;
    world.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.k})`;
    moving = true;
    frame();
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, L.settle);
  }
  function settle() {
    moving = false;
    if (T.k !== settledK) {
      settledK = T.k;
      pct.textContent = Math.round(T.k * 100) + "%";
      // The GPU layer keeps the scale it was drawn at, so text blurs while zooming. Switch
      // detail level and redraw the layer sharp, together, in one pass.
      far = T.k < L.detailZoom;
      world.classList.toggle("far", far);
      world.style.willChange = "auto";
      requestAnimationFrame(() => requestAnimationFrame(() => (world.style.willChange = "")));
    }
    frame();
  }

  // x, y are relative to the stage.
  function zoomAt(x: number, y: number, f: number): void {
    const k = clampK(T.k * f);
    T.x = x - ((x - T.x) * k) / T.k; T.y = y - ((y - T.y) * k) / T.k; T.k = k;
    fitted = false;
    apply();
  }
  function animateTo(tx: number, ty: number, tk: number): void {
    const s = { ...T }, t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / L.slow), e = 1 - Math.pow(1 - p, 3);
      T.x = s.x + (tx - s.x) * e; T.y = s.y + (ty - s.y) * e; T.k = s.k + (tk - s.k) * e; render();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // The part of the stage the inspector does not cover.
  function visible() {
    const open = drawer.classList.contains("open"), sheet = narrow.matches;
    return { w: box.width - (open && !sheet ? drawer.offsetWidth : 0), h: box.height - (open && sheet ? drawer.offsetHeight : 0) };
  }
  const zoomBy = (f: number) => { const v = visible(); zoomAt(v.w / 2, v.h / 2, f); };

  function fit(animate = true) {
    const v = visible();
    const k = clampK(Math.min((v.w - L.margin) / size.width, (v.h - L.margin) / size.height, 1));
    const x = (v.w - size.width * k) / 2, y = (v.h - size.height * k) / 2;
    if (animate) animateTo(x, y, k);
    else { Object.assign(T, { x, y, k }); render(); }
    fitted = true;
  }
  // Bring boxes in diagram space into view.
  function focus(boxes: Box[]): void {
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((p) => p.x)), y0 = Math.min(...boxes.map((p) => p.y));
    const x1 = Math.max(...boxes.map((p) => p.x + p.w)), y1 = Math.max(...boxes.map((p) => p.y + p.h));
    const v = visible();
    const k = boxes.length > 1 ? clampK(Math.min((v.w - 3 * L.margin) / (x1 - x0), (v.h - 3 * L.margin) / (y1 - y0), 1)) : Math.max(T.k, L.zoomFocus);
    fitted = false;
    animateTo(v.w / 2 - ((x0 + x1) / 2) * k, v.h / 2 - ((y0 + y1) / 2) * k, k);
  }

  // ---------- input ----------
  stage.addEventListener("wheel", (e) => {
    if (closest(e, "#drawer")) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * L.zoomWheel));
    else { T.x -= e.deltaX; T.y -= e.deltaY; fitted = false; apply(); }
  }, { passive: false });

  const ptrs = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; tx: number; ty: number } | null = null, moved = false, pinch: { d: number; k: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (closest(e, "#drawer, .zoombar, #sideToggle")) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, tx: T.x, ty: T.y }; moved = false; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: T.k }; drag = null;
    }
  });
  addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const f = (pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d / T.k;
      zoomAt((a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top, f); moved = true; return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < L.dragThreshold) return;
    if (!moved) stage.classList.add("dragging");
    moved = true; fitted = false;
    T.x = drag.tx + dx; T.y = drag.ty + dy; apply();
  });
  const endPtr = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) { drag = null; stage.classList.remove("dragging"); }
  };
  addEventListener("pointerup", endPtr); addEventListener("pointercancel", endPtr);

  zoombar.addEventListener("click", (e) => {
    const z = closest(e, "button")?.dataset.z;
    if (z === "fit") fit();
    else if (z) zoomBy(z === "in" ? L.zoomStep : 1 / L.zoomStep);
  });
  addEventListener("keydown", (e) => {
    if (closest(e, "input, textarea")) return;
    if (e.key === "f") fit();
    if (e.key === "=" || e.key === "+") zoomBy(L.zoomStep);
    if (e.key === "-") zoomBy(1 / L.zoomStep);
  });

  new ResizeObserver(() => {
    const prev = box;
    box = stage.getBoundingClientRect();
    if (fitted) return fit(false);
    T.x += (box.width - prev.width) / 2; T.y += (box.height - prev.height) / 2;
    render();
  }).observe(stage);

  return {
    fit, focus, visible,
    // True when the last press became a drag, so the click that ends it is not a selection.
    wasDragged: () => moved,
    isDragging: () => drag !== null && moved,
  };
}
