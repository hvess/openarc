// The inspector: everything about one component or member, in a drawer over the canvas.

import { esc, closest, $$ } from "./util.ts";
import { statusOf, type IndexedEdge, type Model } from "./model.ts";
import { memberKind } from "./cards.ts";
import type { KlarHTML } from "./klar.ts";
import type { Anchor, Component, Edge, Member } from "./graph.ts";

export interface Inspector { open(id: string): void; close(): void }

const ICON = {
  close: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  chevron: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`,
};
const RESOLUTION: Record<string, (e: Edge) => string> = {
  inferred: (e) => `Asserted by the agent, not resolved from the code${e.label ? ": " + e.label : ""}`,
  dispatch: () => "Called through an interface or function value",
};

// A member is named after its component as in code, Card.member, except a section of a prose
// file, which reads README.md › Install.
const joiner = (m: Member) => (m.kind === "section" ? " › " : ".");
const section = (title: string, body: string) => `<section><h3 class="type-overline">${title}</h3>${body}</section>`;
const pill = (status: string) => `<span class="pill type-overline s-${esc(status)}">${esc(statusOf(status).label)}</span>`;
const tag = (text: string) => `<span class="tag type-code-meta">${esc(text)}</span>`;

export function createInspector(drawer: HTMLElement, app: HTMLElement, { G, members, compOf, outE, inE }: Pick<Model, "G" | "members" | "compOf" | "outE" | "inE">, klarHTML: KlarHTML): Inspector {
  function linkList(list: IndexedEdge[], dir: "in" | "out"): string {
    if (!list.length) return "";
    return `<ul class="links">${list.map((e) => {
      const id = dir === "out" ? e.to : e.from, c = compOf(id)!, m = members.get(id);
      const name = m ? `<span class="cn">${esc(c.name)}${joiner(m)}</span>${esc(m.name)}` : esc(c.name);
      const status = e.status === "context" ? (m || c).status : e.status;
      const res = RESOLUTION[e.resolution];
      const badge = res ? `<span class="inf type-label" title="${esc(res(e))}">${esc(e.resolution)}</span>` : "";
      return `<li><button type="button" data-goto="${esc(id)}"><span class="ek type-code-meta">${esc(e.kind)}</span><span class="dot s-${esc(status)}"></span><span class="en type-code-strong">${name}</span>${badge}</button></li>`;
    }).join("")}</ul>`;
  }

  function effectsHTML(m: Member): string {
    const now = m.effects || [], was = m.baseEffects || now;
    const chips = [
      ...now.map((x) => `<span class="chip ${was.includes(x) ? "" : "new"}">${esc(x)}</span>`),
      ...was.filter((x) => !now.includes(x)).map((x) => `<span class="chip gone">${esc(x)}</span>`),
    ];
    return section("Effects", `<div class="chips type-code-sm">${chips.join("") || `<span class="chip">none</span>`}</div>`);
  }

  function notesFor(id: string): string {
    const ns = (G.notes || []).filter((n) => n.refs.includes(id) || n.refs.includes(compOf(id)?.id ?? id));
    if (!ns.length) return "";
    return `<section class="notes"><h3 class="type-overline">For the reviewer</h3>${ns.map((n) => `<div class="note k-${esc(n.kind)}"><span class="nk type-overline">${esc(n.kind)}</span><span class="type-body-sm">${esc(n.text)}</span></div>`).join("")}</section>`;
  }

  function codeHTML(code: string, start: number): string {
    return code.replace(/\n+$/, "").split("\n").map((l, i) => `<span class="ln"><span class="no">${start + i}</span>${esc(l)}</span>`).join("");
  }

  // The source the Klar was written from, after and before the change, behind a disclosure.
  function rawHTML(m: Member, file: string | undefined): string {
    type Pane = [string, string, Anchor & { code: string }, string];
    const panes = ([["head", "After", m.source, ""], ["base", "Before", m.base, " (before)"]] as [string, string, Anchor | undefined, string][])
      .filter((p): p is Pane => p[2]?.code != null);
    if (!panes.length) return "";
    const first = panes[0][0];
    const tabs = panes.length > 1 ? `<div class="seg">${panes.map(([k, label]) => `<button type="button" data-tab="${k}" class="type-label ${k === first ? "on" : ""}">${label}</button>`).join("")}</div>` : "";
    return `<details class="raw"><summary class="type-body-sm">${ICON.chevron}Source code</summary>
      <p class="why type-label">The code this was written from, for checking it against the Klar.</p>
      ${tabs}
      ${panes.map(([k, , a, suffix]) => {
        const [start, end] = a.lines.map(Number);
        return `<div data-pane="${k}" ${k !== first ? "hidden" : ""}><div class="crumb type-code-meta">${esc(a.file || file)}:${start}–${end}${suffix}</div><pre class="code type-code">${codeHTML(a.code, start)}</pre></div>`;
      }).join("")}
    </details>`;
  }

  function memberBody(m: Member, c: Component): string {
    const uses = outE.get(m.id) || [], usedBy = inE.get(m.id) || [];
    return `
      <h2 class="type-title-code"><span class="cn">${esc(c.name)}${joiner(m)}</span>${esc(m.name)}</h2>
      <div class="badges">${pill(m.status)}${tag(m.kind)}${m.visibility === "private" ? tag("private") : ""}</div>
      ${m.summary ? `<p class="lead type-lead">${esc(m.summary)}</p>` : ""}
      ${m.klar ? section("Klar", `<pre class="klar type-code">${klarHTML(m.klar, m.id)}</pre>`) : ""}
      ${!m.klar && (m.effects || m.baseEffects) ? effectsHTML(m) : ""}
      ${uses.length ? section("Uses", linkList(uses, "out")) : ""}
      ${usedBy.length ? section("Used by", linkList(usedBy, "in")) : ""}
      ${notesFor(m.id)}
      ${rawHTML(m, c.file)}`;
  }

  function componentBody(c: Component): string {
    const usedBy = [...c.members.flatMap((x) => inE.get(x.id) || []), ...(inE.get(c.id) || [])].filter((e) => compOf(e.from) !== c);
    const memberLinks = c.members.map((x) => `<li><button type="button" data-goto="${esc(x.id)}"><span class="ek type-code-meta">${memberKind(x.kind)}</span><span class="dot s-${esc(x.status)}"></span><span class="en type-code-strong">${esc(x.name)}</span></button></li>`);
    return `
      <h2 class="type-title-code">${esc(c.name)}</h2>
      <div class="badges">${pill(c.status)}${tag(c.kind)}</div>
      ${c.summary ? `<p class="lead type-lead">${esc(c.summary)}</p>` : ""}
      ${c.klar ? section("Klar", `<pre class="klar type-code">${klarHTML(c.klar, c.id)}</pre>`) : ""}
      ${section("Members", `<ul class="links">${memberLinks.join("")}</ul>`)}
      ${usedBy.length ? section("Used by", linkList(usedBy, "in")) : ""}
      ${notesFor(c.id)}`;
  }

  drawer.addEventListener("click", (e) => {
    const t = closest(e, "[data-tab]");
    if (!t) return;
    for (const b of $$("[data-tab]", drawer)) b.classList.toggle("on", b === t);
    for (const p of $$("[data-pane]", drawer)) p.hidden = p.dataset.pane !== t.dataset.tab;
  });

  return {
    open(id) {
      const m = members.get(id), c = compOf(id);
      if (!c) return;
      const top = `<div class="dw-top"><span class="crumb type-code-meta">${esc(c.file)}</span><button class="x" type="button" aria-label="Close">${ICON.close}</button></div>`;
      drawer.innerHTML = `<div class="dw">${top}${m ? memberBody(m, c) : componentBody(c)}</div>`;
      drawer.classList.add("open");
      app.classList.add("inspecting");
      drawer.scrollTop = 0;
    },
    close() {
      drawer.classList.remove("open");
      app.classList.remove("inspecting");
    },
  };
}
