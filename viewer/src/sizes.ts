// The sizes and behaviour the layout and the camera depend on, read from the design tokens.
// Durations are in milliseconds.
//
// num reads one token as a number: in the viewer from the page's CSS custom properties, and in
// the build from tools/tokens.ts, so both see the same values. Nothing here touches the DOM.

export function sizesFrom(num: (name: string) => number) {
  return {
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
}

export type Sizes = ReturnType<typeof sizesFrom>;
