#!/usr/bin/env node
// Summarise a trace from bench/profile.mjs: how busy each thread was, what it spent its own time
// on (time in an event minus time in the events nested inside it), and how many frames were
// presented or dropped.
//
//   node bench/analyze-trace.mjs bench/out/trace-pan.json [threads=8] [names=8]

import { readFileSync } from "node:fs";

const [file, nThreads = 8, nNames = 8] = process.argv.slice(2);
const { traceEvents: ev } = JSON.parse(readFileSync(file, "utf8"));

const proc = new Map(), thread = new Map();
for (const e of ev) {
  if (e.ph !== "M") continue;
  if (e.name === "process_name") proc.set(e.pid, e.args.name);
  if (e.name === "thread_name") thread.set(`${e.pid}:${e.tid}`, e.args.name);
}
const label = (key) => { const [pid] = key.split(":"); return `${proc.get(+pid) ?? pid} / ${thread.get(key) ?? key}`; };

const complete = ev.filter((e) => e.ph === "X" && e.dur != null);
let t0 = Infinity, t1 = -Infinity;
for (const e of complete) { t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + e.dur); }
const span = (t1 - t0) / 1000;

// Per thread: busy time (top-level events) and self time per event name.
const byThread = new Map();
for (const e of complete) {
  const k = `${e.pid}:${e.tid}`;
  (byThread.get(k) ?? byThread.set(k, []).get(k)).push(e);
}
const rows = [];
for (const [k, list] of byThread) {
  list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map(), stack = [];
  let busy = 0;
  for (const e of list) {
    while (stack.length && stack.at(-1).end <= e.ts) stack.pop();
    if (stack.length) stack.at(-1).self -= Math.min(e.dur, stack.at(-1).end - e.ts);
    else busy += e.dur;
    const frame = { name: e.name, end: e.ts + e.dur, self: e.dur };
    stack.push(frame);
    frame.done = () => self.set(frame.name, (self.get(frame.name) ?? 0) + frame.self);
    list.frames ??= [];
    list.frames.push(frame);
  }
  for (const f of list.frames) self.set(f.name, (self.get(f.name) ?? 0) + Math.max(0, f.self));
  rows.push({ k, busy: busy / 1000, self: [...self].sort((a, b) => b[1] - a[1]).slice(0, nNames) });
}
rows.sort((a, b) => b.busy - a.busy);

console.log(`${file}: ${span.toFixed(0)} ms traced\n`);
for (const r of rows.slice(0, nThreads)) {
  console.log(`${label(r.k)}: busy ${r.busy.toFixed(0)} ms (${((100 * r.busy) / span).toFixed(0)}%)`);
  for (const [name, us] of r.self) if (us >= 500) console.log(`    ${(us / 1000).toFixed(1).padStart(8)} ms  ${name}`);
}

// Frames: when each was drawn, and how long handing it to the window system took. A present over
// one refresh (16.7 ms at 60 Hz) means the GPU fell behind. Pauses over 200 ms between gestures
// are left out of the intervals.
const draws = ev.filter((e) => e.name === "DirectRenderer::DrawFrame" && e.ph === "X").map((e) => e.ts).sort((a, b) => a - b);
const gaps = draws.slice(1).map((t, i) => (t - draws[i]) / 1000).filter((g) => g < 200);
const present = ev.filter((e) => e.name === "ImageTransportSurfaceOverlayMac::Present" && e.ph === "X").map((e) => e.dur / 1000).sort((a, b) => a - b);
if (gaps.length) {
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  console.log(`\nframes: ${draws.length} drawn, median interval ${median(gaps).toFixed(1)} ms, ${Math.round((100 * gaps.filter((g) => g > 25).length) / gaps.length)}% over 25 ms` +
    (present.length ? `, median present ${median(present).toFixed(1)} ms` : ""));
}
