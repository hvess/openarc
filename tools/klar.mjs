// A deliberately small reader for Klar 0.2 documents: enough to pull out each component's
// header and each member's block, and the effects footer that follows a blank line in a
// member. Not a validating parser.

import { COMPONENT_LINE, MEMBER_LINE } from "../viewer/src/klar-vocab.js";

export function parseKlar(text) {
  const comps = new Map();
  let comp = null, member = null;
  for (const raw of text.split("\n")) {
    const body = raw.slice(2);
    const content = body.trim();
    const indent = body.length - body.trimStart().length;
    if (!content) { if (member) member.lines.push(""); continue; }
    if (indent === 0) {
      const m = content.match(COMPONENT_LINE);
      comp = m ? { name: m[2] ?? m[3], header: [raw], doc: null, members: new Map() } : null;
      if (comp) comps.set(comp.name, comp);
      member = null;
      continue;
    }
    if (!comp) continue;
    if (indent === 2) {
      if (content.startsWith("needs ")) { comp.header.push(raw); member = null; continue; }
      const m = content.match(MEMBER_LINE);
      if (!m) { member = null; continue; }
      if (m[1] === "state") comp.header.push(raw);
      member = { name: m[2], lines: [dedent(raw)] };
      comp.members.set(m[2], member);
      continue;
    }
    if (member) member.lines.push(dedent(raw));
  }
  for (const c of comps.values()) for (const m of c.members.values()) splitEffects(m);
  return comps;
}

// The footer after a member's first blank line lists its effects. A `+` line holds effects
// only after the change and a `-` line effects only before it.
function splitEffects(m) {
  while (m.lines.length && !m.lines.at(-1).trim()) m.lines.pop();
  const blank = m.lines.findIndex((l) => !l.trim());
  if (blank < 0) return;
  const now = [], was = [];
  for (const l of m.lines.slice(blank + 1)) {
    const items = l.slice(2).split("·").map((s) => s.trim()).filter((s) => s && s !== "no effects");
    if (l[0] !== "+") was.push(...items);
    if (l[0] !== "-") now.push(...items);
  }
  m.effects = now;
  if (now.join() !== was.join()) m.baseEffects = was;
}

// Members sit at level 2 in a document but at level 0 in their own block.
function dedent(raw) {
  return raw.slice(0, 2) + raw.slice(4);
}
