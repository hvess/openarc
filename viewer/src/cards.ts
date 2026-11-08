// Cards: measuring their text, and their markup. card-size.ts works out how big each one is.

import { esc, token, num, L } from "./util.ts";
import { STATUS, statusOf } from "./model.ts";
import { ROLES, memberCounts, shortPath, shortSig, cardHeight as heightIn, cardWidth as widthIn, type Role } from "./card-size.ts";
import type { Box } from "./place.ts";
import type { Component } from "./graph.ts";

const MEMBER_KIND: Record<string, string> = { function: "fn", const: "const", state: "state", type: "type", section: "§" };
export const memberKind = (kind: string): string => MEMBER_KIND[kind] ?? esc(kind);

// ---------- measuring ----------
// Card width comes from the widest line it has to show, so text must be measured in the font
// it will be drawn in. Each role's settings are read once.
const ctx = document.createElement("canvas").getContext("2d")!;
let roles: Record<Role, { font: string; tracking: number; upper: boolean }> | null = null, current: Role | null = null;

// Wait for the web fonts, but no longer than diagram.font-timeout; after that, cards are
// measured with the fallback font.
export async function loadFonts(): Promise<void> {
  const font = (role: Role) => token(`type-${role}-font`).replace(/\/\S+/, "");
  await Promise.race([
    Promise.all(ROLES.map((r) => document.fonts.load(font(r)))),
    new Promise((r) => setTimeout(r, L.fontTimeout)),
  ]);
  roles = Object.fromEntries(ROLES.map((r) => [r, {
    font: font(r),
    tracking: (parseFloat(token(`type-${r}-tracking`)) || 0) * num(`type-${r}-size`),
    upper: token(`type-${r}-case`) === "uppercase",
  }])) as NonNullable<typeof roles>;
}

function textWidth(role: Role, text: string): number {
  const r = roles![role];
  if (current !== role) { ctx.font = r.font; current = role; }
  const t = r.upper ? text.toUpperCase() : text;
  return ctx.measureText(t).width + r.tracking * t.length;
}

// ---------- header marks ----------
// Counts of what changed inside, and a square when the whole class came or went.
function changeMarks(c: Component): string {
  if (c.status === "context") return "";
  const counts = memberCounts(c).map(([s, v]) => `<span class="count s-${s}">${STATUS[s].mark}${v}</span>`).join("");
  const whole = statusOf(c.status).whole;
  const square = whole ? `<span class="whole s-${c.status} type-code-strong" title="${whole}" aria-label="${whole}">${STATUS[c.status].mark}</span>` : "";
  return `${counts ? `<span class="counts type-code-sm">${counts}</span>` : ""}${square}`;
}

export const cardHeight = (c: Component): number => heightIn(c, L);
export const cardWidth = (c: Component): number => widthIn(c, L, textWidth);

// ---------- markup ----------
export function cardHTML(c: Component, p: Box): string {
  const s = esc(c.status);
  return `
    <div class="card s-${s}" data-c="${esc(c.id)}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">
      <div class="card-head" data-id="${esc(c.id)}">
        <div class="card-meta type-code-meta"><span class="kind">${esc(c.kind)}</span><span class="path">${esc(shortPath(c.file))}</span></div>
        <div class="card-title"><span class="cname type-heading">${esc(c.name)}</span>${changeMarks(c)}<span class="step type-label"></span></div>
      </div>
      ${c.summary ? `<p class="card-sum type-caption">${esc(c.summary)}</p>` : ""}
      <ul class="rows">${c.members.map((m) => `
        <li class="row s-${esc(m.status)}" data-id="${esc(m.id)}" title="${esc(m.summary)}">
          <span class="g type-code-strong">${statusOf(m.status).mark}</span><span class="mk type-code-meta">${memberKind(m.kind)}</span>
          <span class="mn type-code-strong">${esc(m.name)}</span><span class="sig type-code-sm">${esc(shortSig(m.signature))}</span><span class="step type-label"></span>
        </li>`).join("")}</ul>
    </div>`;
}
