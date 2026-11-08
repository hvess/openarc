// Cards: how big each one is, and its markup.

import { esc, token, num, L } from "./util.js";
import { STATUS, statusOf } from "./model.js";

const MEMBER_KIND = { function: "fn", const: "const", state: "state", type: "type", section: "§" };
export const memberKind = (kind) => MEMBER_KIND[kind] ?? esc(kind);

// `(client: string, plan = "free") -> Decision` reads as `(client, plan) → Decision`.
export const shortSig = (s = "") => {
  const m = s.match(/^\((.*?)\)(.*)$/);
  if (!m) return s;
  const params = m[1].split(",").map((p) => p.split(/[:=]/)[0].trim()).filter(Boolean).join(", ");
  return `(${params})${m[2].replace("->", "→")}`;
};
const shortPath = (f = "") => f.replace(/^src\//, "");

// ---------- measuring ----------
// Card width comes from the widest line it has to show, so text must be measured in the font
// it will be drawn in. Each role's settings are read once.
const ROLES = ["heading", "code-strong", "code-sm", "code-meta"];
const ctx = document.createElement("canvas").getContext("2d");
let roles = null, current = null;

// Wait for the web fonts, but no longer than diagram.font-timeout; after that, cards are
// measured with the fallback font.
export async function loadFonts() {
  const font = (role) => token(`type-${role}-font`).replace(/\/\S+/, "");
  await Promise.race([
    Promise.all(ROLES.map((r) => document.fonts.load(font(r)))),
    new Promise((r) => setTimeout(r, L.fontTimeout)),
  ]);
  roles = Object.fromEntries(ROLES.map((r) => [r, {
    font: font(r),
    tracking: (parseFloat(token(`type-${r}-tracking`)) || 0) * num(`type-${r}-size`),
    upper: token(`type-${r}-case`) === "uppercase",
  }]));
}

function textWidth(role, text) {
  const r = roles[role];
  if (current !== role) { ctx.font = r.font; current = role; }
  const t = r.upper ? text.toUpperCase() : text;
  return ctx.measureText(t).width + r.tracking * t.length;
}

// ---------- header marks ----------
// Counts of what changed inside, and a square when the whole class came or went.
const CHANGES = Object.keys(STATUS).filter((s) => s !== "context");
const memberCounts = (c) => CHANGES.map((s) => [s, c.members.filter((m) => m.status === s).length]).filter(([, n]) => n);

function changeMarks(c) {
  if (c.status === "context") return "";
  const counts = memberCounts(c).map(([s, v]) => `<span class="count s-${s}">${STATUS[s].mark}${v}</span>`).join("");
  const whole = statusOf(c.status).whole;
  const square = whole ? `<span class="whole s-${c.status} type-code-strong" title="${whole}" aria-label="${whole}">${STATUS[c.status].mark}</span>` : "";
  return `${counts ? `<span class="counts type-code-sm">${counts}</span>` : ""}${square}`;
}

function naturalWidth(c) {
  const counts = c.status === "context" ? 0 : memberCounts(c).reduce((w, [s, v]) => w + textWidth("code-sm", STATUS[s].mark + v) + 3 * L.gapSm, 0);
  const marks = counts + (statusOf(c.status).whole ? L.gap + L.mark : 0);
  const head = Math.max(
    textWidth("code-meta", c.kind) + L.gap + Math.min(textWidth("code-meta", shortPath(c.file)), L.wMin / 2),
    textWidth("heading", c.name) + L.gap + marks + L.gap + L.badge,
  );
  const rows = c.members.map((m) =>
    L.gutter + L.gap + L.kind + L.gap + textWidth("code-strong", m.name) + L.gap + textWidth("code-sm", shortSig(m.signature)) + L.gap + L.badge);
  return Math.max(head, ...rows) + 2 * L.padX;
}

export const cardHeight = (c) => L.headH + (c.summary ? L.sumH : 0) + 2 * L.padY + c.members.length * L.rowH;
// Widths are rounded up to the grid and kept between card.width-min and card.width-max.
export const cardWidth = (c) => Math.min(L.wMax, Math.max(L.wMin, Math.ceil(naturalWidth(c) / L.unit) * L.unit));

// ---------- markup ----------
export function cardHTML(c, p) {
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
