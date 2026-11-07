// The graph, indexed for lookups by id, and what each status looks like in the viewer.

// rank orders statuses when several edges are drawn as one; the strongest wins.
export const STATUS = {
  added: { label: "new", mark: "+", rank: 3, whole: "New class" },
  changed: { label: "changed", mark: "~", rank: 1 },
  removed: { label: "removed", mark: "−", rank: 2, whole: "Removed class" },
  context: { label: "context", mark: "", rank: 0 },
};
export const statusOf = (s) => STATUS[s] ?? STATUS.context;

export function indexGraph(G) {
  const comps = new Map(), members = new Map(), rowOf = new Map();
  for (const c of G.components) {
    comps.set(c.id, c);
    c.members.forEach((m, i) => { m.component = c; members.set(m.id, m); rowOf.set(m.id, i); });
  }
  const compOf = (id) => members.get(id)?.component || comps.get(id);

  // Edges whose ends are missing cannot be drawn; a built graph has none.
  const edges = G.edges.filter((e) => compOf(e.from) && compOf(e.to)).map((e, i) => ({ resolution: "static", ...e, i }));
  const outE = new Map(), inE = new Map();
  const push = (map, key, e) => (map.get(key) ?? map.set(key, []).get(key)).push(e);
  for (const e of edges) { push(outE, e.from, e); push(inE, e.to, e); }

  // One edge per ordered pair of cards, in the strongest status among the edges it stands for.
  // The layout uses these, and so does the far view, where member edges join up.
  const pairs = new Map();
  for (const e of edges) {
    const a = compOf(e.from).id, b = compOf(e.to).id;
    if (a === b) continue;
    const key = a + ">" + b, prev = pairs.get(key);
    if (!prev || statusOf(e.status).rank > statusOf(prev.status).rank) pairs.set(key, { from: a, to: b, status: e.status, kind: "calls", resolution: "static" });
  }

  // Edges touching an id; for a component, also those touching its members.
  const relatedEdges = (id) => {
    const ids = comps.has(id) ? [id, ...comps.get(id).members.map((m) => m.id)] : [id];
    return ids.flatMap((x) => [...(outE.get(x) || []), ...(inE.get(x) || [])]);
  };

  return { G, comps, members, rowOf, compOf, edges, outE, inE, cardEdges: [...pairs.values()], relatedEdges };
}
