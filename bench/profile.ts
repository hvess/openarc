#!/usr/bin/env node
// Record a performance trace of the viewer in a Chromium browser, driving real input through the
// DevTools protocol, so traces cover every thread: main, compositor, raster and GPU.
//
// Start a separate browser with its own profile and remote debugging, for example Helium:
//
//   /Applications/Helium.app/Contents/MacOS/Helium --user-data-dir=/tmp/openarc-profile \
//     --remote-debugging-port=9333 '--remote-allow-origins=*' --no-first-run about:blank
//
// then serve the repository (npm run serve) and run
//
//   node bench/profile.ts <url> <scenario> [out.json]      scenario: startup | pan | longpan | wheel | zoom
//
// Keep the browser window in front while it runs; hidden windows throttle frames. The trace opens
// in DevTools' Performance panel, and bench/analyze-trace.ts summarises it.

import { writeFileSync } from "node:fs";

// A DevTools protocol message: a reply carries the id of its request, an event a method.
interface Message { id?: number; method?: string; params?: any; result?: any; error?: { message: string } }
interface Box { x: number; y: number; w: number; h: number }

const [url, scenario = "pan", out = `bench/out/trace-${scenario}.json`] = process.argv.slice(2);
const port = process.env.CDP_PORT ?? 9333;
if (!url) {
  console.error("usage: node bench/profile.ts <url> <startup|pan|longpan|wheel|zoom> [out.json]");
  process.exit(1);
}

const CATEGORIES = [...(process.env.EXTRA_CATEGORIES?.split(",") ?? []),
  "toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame",
  "blink", "cc", "gpu", "viz", "v8.execute", "input", "latencyInfo", "benchmark", "loading",
];

type Target = { type: string; webSocketDebuggerUrl: string };
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Target[];
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target; open a tab in the browser");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>(), listeners: ((m: Message) => void)[] = [];
ws.onmessage = ({ data }) => {
  const m: Message = JSON.parse(data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id)!; pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  else for (const l of listeners) l(m);
};
const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

async function load() {
  await send("Page.navigate", { url });
  for (let i = 0; i < 600 && !(await evaluate("!!document.querySelector('.card')")); i++) await sleep(50);
}

let events: unknown[] = [];
async function trace(fn: () => Promise<void>) {
  events = [];
  const done = new Promise<void>((r) => listeners.push((m) => {
    if (m.method === "Tracing.dataCollected") events.push(...m.params.value);
    if (m.method === "Tracing.tracingComplete") r();
  }));
  await send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: CATEGORIES } });
  await fn();
  await send("Tracing.end");
  await done;
}

// Input arrives on a fixed clock at 120 per second, like a trackpad, without waiting for each
// event to be handled; waiting would pace input, and so frames, by the protocol's round trip.
const mouse = (type: string, x: number, y: number, extra: object = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseWheel" ? "none" : "left", clickCount: type === "mousePressed" ? 1 : 0, ...extra });
const HZ = 120;
async function paced(steps: number, fn: (i: number) => Promise<unknown>) {
  const start = performance.now(), sent: Promise<unknown>[] = [];
  for (let i = 1; i <= steps; i++) {
    const due = start + (i * 1000) / HZ;
    while (performance.now() < due) await sleep(Math.max(0, Math.min(4, due - performance.now())));
    sent.push(fn(i));
  }
  await Promise.all(sent);
}
async function drag(x0: number, y0: number, dx: number, dy: number, steps: number) {
  await mouse("mousePressed", x0, y0);
  await paced(steps, (i) => mouse("mouseMoved", x0 + (dx * i) / steps, y0 + (dy * i) / steps, { buttons: 1 }));
  await mouse("mouseReleased", x0 + dx, y0 + dy);
}
const wheel = (x: number, y: number, dx: number, dy: number, steps: number, modifiers = 0) => paced(steps, () => mouse("mouseWheel", x, y, { deltaX: dx, deltaY: dy, modifiers }));

await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");
const box: Box = await (async () => { if (scenario !== "startup") await load(); return evaluate("(() => { const r = document.getElementById('stage')?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight }; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()"); })();
if (scenario !== "startup") await sleep(2000);

await trace(async () => {
  if (scenario === "startup") { await load(); await sleep(1500); return; }
  if (scenario === "pan") { for (let i = 0; i < 2; i++) { await drag(box.x, box.y, -300, -120, 120); await drag(box.x - 300, box.y - 120, 300, 120, 120); } }
  // Far enough to leave the painted margin several times, so the edge bitmap repaints.
  if (scenario === "longpan") { await drag(box.x + box.w * 0.4, box.y, -box.w * 0.8, 0, 180); await drag(box.x - box.w * 0.4, box.y, box.w * 0.8, 0, 180); await drag(box.x + box.w * 0.4, box.y, -box.w * 0.8, 0, 180); }
  if (scenario === "wheel") { await wheel(box.x, box.y, 3, 1.5, 180); await wheel(box.x, box.y, -3, -1.5, 180); }
  if (scenario === "zoom") { await wheel(box.x, box.y, 0, -2, 120, 2); await wheel(box.x, box.y, 0, 2, 120, 2); await sleep(400); }
  await sleep(500);
});

writeFileSync(out, JSON.stringify({ traceEvents: events }));
console.log(`✓ ${out} (${events.length} events, ${scenario}, ${url})`);
ws.close();
