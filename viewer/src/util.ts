// DOM helpers and design tokens, shared by every part of the viewer.

import { sizesFrom } from "./sizes.ts";

// The viewer's own markup always has what it looks for, so a miss is a bug, not a case to handle.
export const $ = <E extends Element = HTMLElement>(s: string, el: ParentNode = document): E => el.querySelector<E>(s)!;
export const $$ = <E extends Element = HTMLElement>(s: string, el: ParentNode = document): E[] => [...el.querySelectorAll<E>(s)];
// The element an event happened in, or its nearest ancestor, that matches a selector.
export const closest = <E extends Element = HTMLElement>(e: Event, s: string): E | null => (e.target as Element).closest?.<E>(s) ?? null;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
// Everything that comes from the graph goes through esc() before it reaches markup.
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

// Tokens are the CSS custom properties tools/tokens.ts generates from design/. The computed
// style is live, so reads after a theme change see the new theme.
const rootStyle = getComputedStyle(document.documentElement);
export const token = (name: string): string => rootStyle.getPropertyValue("--" + name).trim();
export const num = (name: string): number => parseFloat(token(name));

// The sizes and behaviour the layout and the camera depend on.
export const L = sizesFrom(num);

// Matches when the sidebar and inspector are sheets over the canvas.
export const narrow = matchMedia(`(max-width: ${token("breakpoint-narrow")})`);
