// DOM helpers and design tokens, shared by every part of the viewer.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
// Everything that comes from the graph goes through esc() before it reaches markup.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

// Tokens are the CSS custom properties tools/tokens.mjs generates from design/. The computed
// style is live, so reads after a theme change see the new theme.
const rootStyle = getComputedStyle(document.documentElement);
export const token = (name) => rootStyle.getPropertyValue("--" + name).trim();
export const num = (name) => parseFloat(token(name));

// The sizes and behaviour the layout and the camera depend on. Durations are in milliseconds.
export const L = {
  unit: num("grid-unit"), canvas: num("grid-canvas"),
  headH: num("card-head-height"), sumH: num("card-summary-height"), rowH: num("card-row-height"),
  padX: num("card-padding-x"), padY: num("card-padding-y"), gutter: num("card-gutter"), kind: num("card-kind"),
  wMin: num("card-width-min"), wMax: num("card-width-max"), gap: num("space-2"), gapSm: num("space-1"),
  badge: num("badge-size"), mark: num("badge-mark"),
  layerGap: num("diagram-layer-gap"), nodeGap: num("diagram-node-gap"), edgeGap: num("diagram-edge-gap"), margin: num("space-10"),
  slow: num("motion-duration-slow"), settle: num("diagram-settle-delay"), paintDelay: num("diagram-paint-delay"), fontTimeout: num("diagram-font-timeout"),
  zoomMin: num("diagram-zoom-min"), zoomMax: num("diagram-zoom-max"), zoomStep: num("diagram-zoom-step"), zoomWheel: num("diagram-zoom-wheel"),
  zoomFocus: num("diagram-zoom-focus"), detailZoom: num("diagram-detail-zoom"), dragThreshold: num("diagram-drag-threshold"),
  edgeMargin: num("diagram-edge-margin"), edgeMarginMoving: num("diagram-edge-margin-moving"), edgeDensityMoving: num("diagram-edge-density-moving"),
  largeGraph: num("diagram-large-graph"),
};

// Matches when the sidebar and inspector are sheets over the canvas.
export const narrow = matchMedia(`(max-width: ${token("breakpoint-narrow")})`);
