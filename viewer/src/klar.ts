// Klar highlighting (spec/klar.md § 13). Control words, declarations, verbs and effect words come
// from the language's fixed vocabulary. Names are highlighted only when something defines them:
// the graph, a signature, `needs`, or a binding. Calls that match one of the member's edges
// become links to the member they reach.

import { esc } from "./util.ts";
import { CONTROL, DECLARATIONS, VERBS, EFFECTS, MEMBER_LINE } from "./klar-vocab.ts";
import type { Model } from "./model.ts";

// What a member's Klar may name, and its calls that lead to other members (name → member id).
interface Context { refs: Set<string>; calls: Map<string, string> }
export type KlarHTML = (src: string, id: string) => string;

const DECL = new Set(DECLARATIONS);
const VERB = new Set(VERBS);
// Small words that never read as a value after "is" or "Return".
const PLAIN = new Set(["missing", "exists", "not", "no", "has", "is", "in", "of", "for", "from", "to", "and", "or", "with"]);
const TOK = new RegExp(`\\b(${CONTROL.join("|")})\\b|("[^"]*")|(#.*$)|(\\b\\d+(?:\\.\\d+)?(?:\\s(?:s|ms|min)\\b)?)|([A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)*)|(→|≥|≤|≠|=|\\+|×|÷|−|·|\\||<|>|:|…)`, "g");
const EFFECT = new RegExp(`^(${EFFECTS.join("|")})\\b`);
const DECL_LINE = /^(?:private|state|const|needs)\b/;

const namesIn = (list: string | undefined): string[] => (list || "").split(",").map((p) => p.split("=")[0].trim()).filter((n) => /^[A-Za-z_]\w*$/.test(n));

export function createKlar({ comps, members, compOf, outE }: Pick<Model, "comps" | "members" | "compOf" | "outE">): KlarHTML {
  const graphNames = new Set<string>();
  for (const c of comps.values()) {
    graphNames.add(c.name);
    for (const m of c.members) graphNames.add(m.name.split(".").pop()!);
  }

  // The names a member's Klar may use, and the calls that lead to other members.
  function context(id: string): Context {
    const c = compOf(id), m = members.get(id);
    const refs = new Set(graphNames);
    for (const src of [c?.klar, m?.klar]) {
      for (const line of (src || "").split("\n")) {
        const body = line.slice(2).trim();
        const decl = body.match(MEMBER_LINE);
        if (decl && !decl[1] && body[decl[0].length] === "(") for (const g of body.matchAll(/\(([^)]*)\)/g)) namesIn(g[1]).forEach((n) => refs.add(n));
        const needs = body.match(/^needs\s+(.*)$/);
        if (needs) namesIn(needs[1]).forEach((n) => refs.add(n));
        const bind = body.match(/^([A-Za-z_]\w*)\s*=\s/);
        if (bind) refs.add(bind[1]);
      }
    }
    const calls = new Map<string, string>();
    for (const e of outE.get(id) || []) {
      const t = members.get(e.to);
      if (t) calls.set(t.name.split(".").pop()!, t.id);
    }
    return { refs, calls };
  }

  function tokens(s: string, ctx: Context, isDecl: boolean): string {
    let out = "", last = 0, m: RegExpExecArray | null, named = false;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      out += esc(s.slice(last, m.index));
      const [t, control, str, com, number, word] = m;
      const paren = word && s[m.index + t.length] === "(";
      const before = s.slice(0, m.index);
      const span = (cls: string) => `<span class="${cls}">${esc(t)}</span>`;
      if (control) out += span("t-kw");
      else if (str || number) out += span("t-val");
      else if (com) out += span("t-com");
      else if (word) {
        const base = t.split(".")[0], tail = t.split(".").pop()!;
        if (DECL.has(t) && !before.trim().replace(/\b(private|const|state)\b/g, "").trim()) out += span("t-decl");
        else if (isDecl && !named) { out += span("t-fn"); named = true; }
        else if (paren && ctx.calls.has(tail)) out += `<span class="t-call" data-goto="${esc(ctx.calls.get(tail)!)}">${esc(t)}</span>`;
        else if (ctx.refs.has(base) || (paren && t.includes("."))) out += span("t-ref");
        else if (VERB.has(t) && (!before.trim() || /=\s*$/.test(before))) out += span("t-verb");
        else if (!PLAIN.has(t) && /(?:Return|Fail|is|→|\|)\s*$/.test(before)) out += span("t-val");
        else out += esc(t);
      } else out += span("t-op");
      last = m.index + t.length;
    }
    return out + esc(s.slice(last));
  }

  function effects(s: string, ctx: Context): string {
    return s.split("·").map((part) => {
      const p = part.trim(), e = p.match(EFFECT);
      if (!e) return esc(p);
      // Odd parts of the split are words.
      const rest = p.slice(e[0].length).split(/([A-Za-z_]\w*)/).map((w, i) => (i % 2 && ctx.refs.has(w) ? `<span class="t-ref">${w}</span>` : esc(w))).join("");
      return `<span class="t-eff">${esc(e[0])}</span>${rest}`;
    }).join(` <span class="t-op">·</span> `);
  }

  // A Klar block, gutter included, as highlighted lines. Lines after the first blank line are
  // the effects footer.
  return function klarHTML(src, id) {
    const ctx = context(id);
    let footer = false;
    return src.replace(/\n+$/, "").split("\n").map((line, i) => {
      const g = line[0] || " ", rest = line.slice(2);
      const cls = g === "+" ? "ln-add" : g === "-" ? "ln-del" : g === "~" ? "ln-chg" : "";
      const gut = `<span class="gut">${g === " " ? "" : g === "-" ? "−" : esc(g)}</span>`;
      if (!rest.trim()) { if (i > 0) footer = true; return `<span class="ln ${cls}">${gut}</span>`; }
      const n = rest.length - rest.trimStart().length;
      const ind = Array.from({ length: Math.floor(n / 2) }, (_, k) => `<span class="ind${k >= 1 ? " rail" : ""}"></span>`).join("") + (n % 2 ? " " : "");
      const body = rest.trimStart();
      const isDecl = i === 0 || (n === 0 && DECL_LINE.test(body)) || /^(?:private|state|const)\s/.test(body);
      return `<span class="ln ${cls}">${gut}${ind}${footer ? effects(body, ctx) : tokens(body, ctx, isDecl)}</span>`;
    }).join("");
  };
}
