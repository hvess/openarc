// Measure the viewer on the page it runs in. Evaluate it in the page (paste it into the console);
// it resolves to a table of timings. Run it with the window visible: background tabs throttle
// timers and animation frames, which makes every number meaningless.
//
//   ready_ms        navigation start to cards on screen
//   select_*_ms     median main-thread time to select and then clear, over five targets
//   flow_ms         median time to turn a flow on and off
//   hover_ms        median time to draw a member's edges on hover
//   pan, zoom       frame times while dragging and wheel-zooming: median / p95 / max ms
(async () => {
  await new Promise((r) => { const t = setInterval(() => { if (document.querySelector(".card")) { clearInterval(t); r(); } }, 10); });
  const ready = Math.round(performance.now());
  await new Promise((r) => setTimeout(r, 1500));

  const median = (fn, n = 5) => {
    const ts = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(i); ts.push(performance.now() - t0); }
    return +ts.sort((a, b) => a - b)[n >> 1].toFixed(2);
  };
  const clear = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const heads = [...document.querySelectorAll(".card-head")]
    .sort((a, b) => b.parentElement.querySelectorAll(".row").length - a.parentElement.querySelectorAll(".row").length).slice(0, 5);
  const rows = [...document.querySelectorAll(".row")].slice(0, 5);
  const flow = document.querySelector(".flow");

  const out = {
    ready_ms: ready, cards: document.querySelectorAll(".card").length, rows: document.querySelectorAll(".row").length,
    dom_nodes: document.getElementsByTagName("*").length,
    select_card_ms: median((i) => { heads[i].click(); clear(); }),
    select_row_ms: median((i) => { rows[i].click(); clear(); }),
    flow_ms: flow ? median(() => { flow.click(); flow.click(); }) : null,
    hover_ms: median((i) => rows[i].dispatchEvent(new PointerEvent("pointerover", { bubbles: true }))),
  };

  const stage = document.getElementById("stage"), b = stage.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const frames = (n, step) => new Promise((done) => {
    const t = []; let last = null, i = 0;
    const f = (ts) => { if (last !== null) t.push(ts - last); last = ts; step(i); if (++i < n) requestAnimationFrame(f); else done(t); };
    requestAnimationFrame(f);
  });
  const stat = (t) => { t.sort((a, c) => a - c); return `${Math.round(t[t.length >> 1])} / ${Math.round(t[Math.floor(t.length * 0.95)])} / ${Math.round(t.at(-1))}`; };
  stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: cx, clientY: cy }));
  out.pan = stat(await frames(60, (i) => dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: cx - i * 8, clientY: cy - i * 3 }))));
  dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  await new Promise((r) => setTimeout(r, 800));
  out.zoom = stat(await frames(40, (i) => stage.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, clientX: cx, clientY: cy, deltaY: i < 20 ? -6 : 6 }))));
  return out;
})();
