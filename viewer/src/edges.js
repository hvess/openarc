// Where each edge runs. Every edge leaves and enters a card horizontally. The line stops at the
// arrowhead's notch, and the head is its own shape so it can grow with the line when emphasised.

import { esc, num, L } from "./util.js";

const AR = { len: num("diagram-arrow-length"), wid: num("diagram-arrow-width"), notch: num("diagram-arrow-notch") };
export const HEAD = `M0,0 L${-AR.len},${-AR.wid / 2} Q${-AR.len * AR.notch},0 ${-AR.len},${AR.wid / 2} Z`;

// pos: card id → { x, y, w, h }. Returns pathBetween(fromId, toId) → { d, tip, dir, box }.
export function createGeometry({ compOf, rowOf }, pos) {
  // The middle of a member's row, or of the card's header, on the left or right side.
  function anchor(id, side, gap = 0) {
    const c = compOf(id), p = pos.get(c.id), i = rowOf.get(id);
    const y = i == null ? p.y + L.headH / 2 : p.y + L.headH + (c.summary ? L.sumH : 0) + L.padY + i * L.rowH + L.rowH / 2;
    return { x: side === "r" ? p.x + p.w + gap : p.x - gap, y };
  }
  function curve(a, c1x, c2x, b) {
    const dir = Math.sign(b.x - c2x) || 1, endX = b.x - dir * AR.len * AR.notch, m = AR.len * 2;
    return {
      d: `M${a.x},${a.y} C${c1x},${a.y} ${c2x},${b.y} ${endX},${b.y}`, tip: b, dir,
      // A cubic curve stays inside the box of its control points; the margin covers the head.
      box: { x0: Math.min(a.x, c1x, c2x, endX) - m, y0: Math.min(a.y, b.y) - m, x1: Math.max(a.x, c1x, c2x, endX) + m, y1: Math.max(a.y, b.y) + m },
    };
  }
  return function pathBetween(from, to) {
    const cs = compOf(from), ct = compOf(to), ps = pos.get(cs.id), pt = pos.get(ct.id), g = L.edgeGap, bend = L.layerGap / 2;
    if (cs === ct) {
      const a = anchor(from, "r"), b = anchor(to, "r", g), bx = L.padX + Math.abs(b.y - a.y) / 4;
      return curve(a, a.x + bx, b.x + bx, b);
    }
    if (pt.x >= ps.x + ps.w) {
      const a = anchor(from, "r"), b = anchor(to, "l", g), dx = Math.max(bend, (b.x - a.x) / 2);
      return curve(a, a.x + dx, b.x - dx, b);
    }
    if (pt.x + pt.w <= ps.x) {
      const a = anchor(from, "l"), b = anchor(to, "r", g), dx = Math.max(bend, (a.x - b.x) / 2);
      return curve(a, a.x - dx, b.x + dx, b);
    }
    const a = anchor(from, "r"), b = anchor(to, "r", g), xm = Math.max(a.x, b.x) + bend;
    return curve(a, xm, xm, b);
  };
}

// SVG for emphasised edges, drawn over the painted base layer.
export const headAt = (p) => `<g transform="translate(${p.tip.x},${p.tip.y}) rotate(${p.dir > 0 ? 0 : 180})"><path class="head" d="${HEAD}"/></g>`;
export const edgeHTML = (e, p, cls = "") =>
  `<g class="edge-g s-${esc(e.status)} k-${esc(e.kind)}${e.resolution !== "static" ? " inferred" : ""} ${cls}"><path class="edge" d="${p.d}"/>${headAt(p)}</g>`;
