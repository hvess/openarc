// The graph, indexed for lookups by id, and what each status looks like in the viewer.

import type { Component, Edge, Graph, Member, Resolution, Status } from "./graph.ts";

interface StatusLook { label: string; mark: string; rank: number; whole?: string }

// rank orders statuses when several edges are drawn as one; the strongest wins.
export const STATUS: Record<Status, StatusLook> = {
  added: { label: "new", mark: "+", rank: 3, whole: "New class" },
  changed: { label: "changed", mark: "~", rank: 1 },
  removed: { label: "removed", mark: "−", rank: 2, whole: "Removed class" },
  context: { label: "context", mark: "", rank: 0 },
};
export const statusOf = (s: string): StatusLook => STATUS[s as Status] ?? STATUS.context;
export const STATUSES = Object.keys(STATUS) as Status[];

// A member that knows its component.
export interface IndexedMember extends Member { component: Component }
// An edge with its index in model.edges and its resolution filled in.
export interface IndexedEdge extends Edge { i: number; resolution: Resolution }
export type Model = ReturnType<typeof indexGraph>;

export function indexGraph(G: Graph) {
  const comps = new Map<string, Component>(), members = new Map<string, IndexedMember>(), rowOf = new Map<string, number>();
  for (const c of G.components) {
    comps.set(c.id, c);
    c.members.forEach((m, i) => { const im = Object.assign(m, { component: c }); members.set(m.id, im); rowOf.set(m.id, i); });
  }
  const compOf = (id: string | null | undefined): Component | undefined => (id == null ? undefined : members.get(id)?.component || comps.get(id));

  // Edges whose ends are missing cannot be drawn; a built graph has none.
  const edges: IndexedEdge[] = G.edges.filter((e) => compOf(e.from) && compOf(e.to)).map((e, i) => ({ resolution: "static", ...e, i }));
  const outE = new Map<string, IndexedEdge[]>(), inE = new Map<string, IndexedEdge[]>();
  const push = (map: Map<string, IndexedEdge[]>, key: string, e: IndexedEdge) => (map.get(key) ?? map.set(key, []).get(key)!).push(e);
  for (const e of edges) { push(outE, e.from, e); push(inE, e.to, e); }

  // One edge per ordered pair of cards, in the strongest status among the edges it stands for.
  // The layout uses these, and so does the far view, where member edges join up.
  const pairs = new Map<string, Edge>();
  for (const e of edges) {
    const a = compOf(e.from)!.id, b = compOf(e.to)!.id;
    if (a === b) continue;
    const key = a + ">" + b, prev = pairs.get(key);
    if (!prev || statusOf(e.status).rank > statusOf(prev.status).rank) pairs.set(key, { from: a, to: b, status: e.status, kind: "calls", resolution: "static" });
  }

  // Edges touching an id; for a component, also those touching its members.
  const relatedEdges = (id: string): IndexedEdge[] => {
    const c = comps.get(id);
    const ids = c ? [id, ...c.members.map((m) => m.id)] : [id];
    return ids.flatMap((x) => [...(outE.get(x) || []), ...(inE.get(x) || [])]);
  };

  return { G, comps, members, rowOf, compOf, edges, outE, inE, cardEdges: [...pairs.values()], relatedEdges };
}
