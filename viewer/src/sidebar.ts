// The sidebar: what the change is, its flows and notes, and a legend.

import { esc } from "./util.ts";
import { STATUS, STATUSES, type Model } from "./model.ts";
import type { Status } from "./graph.ts";

// An O that stops short on a hollow node. The ring has no fill, so the mark works on any background.
const LOGO = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M13.2 8.74A5.25 5.25 0 1 1 9.36 2.93" stroke-width="1.75"/><circle cx="13.07" cy="6.64" r="1.75" stroke-width="1.4"/></svg>`;
const LEGEND: [Status, string, string, string][] = [
  ["added", "Added", "", "Calls"],
  ["changed", "Changed", "ln-inferred", "Inferred"],
  ["removed", "Removed", "ln-data", "Reads, writes"],
  ["context", "Context", "ln-creates", "Creates"],
];

export function renderSide(el: HTMLElement, { G, members }: Pick<Model, "G" | "members">): void {
  const counts = new Map(STATUSES.map((s) => [s, 0]));
  for (const m of members.values()) if (counts.has(m.status)) counts.set(m.status, counts.get(m.status)! + 1);
  const stats = [...counts].filter(([s, n]) => n && s !== "context")
    .map(([s, n]) => `<span class="stat s-${s}">${STATUS[s].mark}${n} ${s}</span>`).join("");

  el.innerHTML = `
    <header class="side-head type-body-strong">${LOGO}OpenArc</header>
    <div class="side-body">
      <div>
        <h1 class="type-display">${esc(G.change.title)}</h1>
        <p class="summary type-body-sm">${esc(G.change.summary)}</p>
        <div class="stats type-code-sm">${stats}</div>
      </div>
      ${G.flows?.length ? `<section class="sec"><h2 class="type-overline">Flows</h2><div class="flows">${G.flows.map((f) => `
        <button class="flow" data-flow="${esc(f.id)}" type="button">
          <span class="fn"><span class="type-body-strong">${esc(f.name)}</span><small class="type-code-meta">${f.steps.length} steps</small></span>
          <span class="fd type-body-sm">${esc(f.description)}</span>
        </button>`).join("")}</div></section>` : ""}
      ${G.notes?.length ? `<section class="sec"><h2 class="type-overline">For the reviewer</h2><div class="notes-list">${G.notes.map((n, i) => `
        <button class="note k-${esc(n.kind)}" data-note="${i}" type="button"><span class="nk type-overline">${esc(n.kind)}</span><span class="type-body-sm">${esc(n.text)}</span></button>`).join("")}</div></section>` : ""}
    </div>
    <footer class="side-foot">
      <div class="legend type-label">${LEGEND.map(([s, label, line, lineLabel]) => `
        <span><i class="sw s-${s}"></i>${label}</span>
        <span><svg viewBox="0 0 24 8"><path${line ? ` class="${line}"` : ""} d="M${line === "ln-data" ? 1 : 0} 4H24"/></svg>${lineLabel}</span>`).join("")}
      </div>
      <div class="foot-row type-label">
        <span>Drag to pan · ⌘ scroll to zoom</span>
        <span class="type-code-meta">graph ${esc(G.openarc)}</span>
      </div>
    </footer>`;
}
