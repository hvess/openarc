// How big each card is. Height comes from the tokens alone; width comes from the widest line the
// card shows, so it depends on how wide text is. The viewer measures text in the fonts it draws
// with, and the build estimates it, so this module takes a measure function and touches no DOM.

import { STATUS, STATUSES, statusOf } from "./model.ts";
import type { Sizes } from "./sizes.ts";
import type { Component } from "./graph.ts";

// The text roles a card's width depends on.
export const ROLES = ["heading", "code-strong", "code-sm", "code-meta"] as const;
export type Role = (typeof ROLES)[number];
export type Measure = (role: Role, text: string) => number;

// `(client: string, plan = "free") -> Decision` reads as `(client, plan) → Decision`.
export const shortSig = (s = ""): string => {
  const m = s.match(/^\((.*?)\)(.*)$/);
  if (!m) return s;
  const params = m[1].split(",").map((p) => p.split(/[:=]/)[0].trim()).filter(Boolean).join(", ");
  return `(${params})${m[2].replace("->", "→")}`;
};
export const shortPath = (f = ""): string => f.replace(/^src\//, "");

// Counts of what changed inside a card, as shown in its header.
const CHANGES = STATUSES.filter((s) => s !== "context");
export const memberCounts = (c: Component) => CHANGES.map((s) => [s, c.members.filter((m) => m.status === s).length] as const).filter(([, n]) => n);

function naturalWidth(c: Component, L: Sizes, measure: Measure): number {
  const counts = c.status === "context" ? 0 : memberCounts(c).reduce((w, [s, v]) => w + measure("code-sm", STATUS[s].mark + v) + 3 * L.gapSm, 0);
  const marks = counts + (statusOf(c.status).whole ? L.gap + L.mark : 0);
  const head = Math.max(
    measure("code-meta", c.kind) + L.gap + Math.min(measure("code-meta", shortPath(c.file)), L.wMin / 2),
    measure("heading", c.name) + L.gap + marks + L.gap + L.badge,
  );
  const rows = c.members.map((m) =>
    L.gutter + L.gap + L.kind + L.gap + measure("code-strong", m.name) + L.gap + measure("code-sm", shortSig(m.signature)) + L.gap + L.badge);
  return Math.max(head, ...rows) + 2 * L.padX;
}

export const cardHeight = (c: Component, L: Sizes): number => L.headH + (c.summary ? L.sumH : 0) + 2 * L.padY + c.members.length * L.rowH;
// Widths are rounded up to the grid and kept between card.width-min and card.width-max.
export const cardWidth = (c: Component, L: Sizes, measure: Measure): number =>
  Math.min(L.wMax, Math.max(L.wMin, Math.ceil(naturalWidth(c, L, measure) / L.unit) * L.unit));
