import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bundle, checkSyntax } from "../tools/bundle.ts";
import { buildTokens } from "../tools/tokens.ts";
import { buildPage } from "../tools/page.ts";
import { placeCards } from "../viewer/src/place.ts";
import type { Graph } from "../viewer/src/graph.ts";

const viewer = new URL("../viewer/src/main.ts", import.meta.url).pathname;

function withFiles<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "openarc-"));
  try {
    for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, name), code);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the viewer bundles into valid JavaScript", () => {
  checkSyntax(bundle(viewer));
});

test("bundled modules keep their own scope and their imports", () => {
  withFiles({
    "a.js": 'export const x = 1;\nconst hidden = 2;\nexport function f() { return hidden; }\n',
    "main.js": 'import { x, f as g } from "./a.js";\nconst hidden = 3;\nglobalThis.out = [x, g(), hidden];\n',
  }, (dir) => {
    const code = bundle(join(dir, "main.js"));
    new Function(code)();
    assert.deepEqual((globalThis as { out?: unknown }).out, [1, 2, 3]);
  });
});

test("bundled TypeScript modules lose their types and type-only imports", () => {
  withFiles({
    "types.ts": "export interface Box { w: number }\nexport type Size = number;\n",
    "a.ts": 'import type { Box } from "./types.ts";\nexport const area = (b: Box): number => b.w * b.w;\n',
    "main.ts": 'import { area } from "./a.ts";\nimport type { Size } from "./types.ts";\nconst s: Size = area({ w: 3 } as const);\nglobalThis.out = s;\n',
  }, (dir) => {
    const code = bundle(join(dir, "main.ts"));
    assert.doesNotMatch(code, /types_ts|interface|: number/);
    new Function(code)();
    assert.equal((globalThis as { out?: unknown }).out, 9);
  });
});

test("the bundler rejects cycles and forms it does not support", () => {
  withFiles({ "a.js": 'import { b } from "./b.js";\nexport const a = 1;\n', "b.js": 'import { a } from "./a.js";\nexport const b = 1;\n' },
    (dir) => assert.throws(() => bundle(join(dir, "a.js")), /import cycle/));
  withFiles({ "main.js": 'import x from "./x.js";\n' }, (dir) => assert.throws(() => bundle(join(dir, "main.js")), /only/));
});

test("tokens: one class per status, no unused or repeated declarations", () => {
  const { css, statuses } = buildTokens();
  assert.deepEqual(statuses, ["added", "changed", "removed", "context"]);
  for (const s of statuses) assert.match(css, new RegExp(`\\.s-${s} \\{\\n  --st-solid: var\\(--color-status-${s}-solid\\);`));
  assert.doesNotMatch(css, /-weight: \d/);
  assert.doesNotMatch(css, /data-theme="light"/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme\]\)/);
});

const example = (): Graph => JSON.parse(readFileSync(new URL("../examples/rate-limit/graph.json", import.meta.url), "utf8"));
function withLayoutEngine<T>(layoutEngine: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "openarc-"));
  writeFileSync(join(dir, "openarc.config.json"), JSON.stringify({ layoutEngine }));
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("a built page carries its layout and no layout engine", async () => {
  const graph = example();
  const { html } = await buildPage(graph, new URL("..", import.meta.url).pathname);
  assert.doesNotMatch(html, /src="\.\.\/|href="tokens\.css"|data-src=|src="src\//);
  assert.match(html, /<script id="openarc-elk" type="text\/plain"><\/script>/);
  assert.ok(html.length < 300_000, `${html.length} bytes`);
  const laid = JSON.parse(html.match(/<script id="openarc-layout" type="application\/json">(.*?)<\/script>/)![1]);
  assert.deepEqual(laid.children.map((n: { id: string }) => n.id.slice(2)).sort(), graph.components.map((c) => c.id).sort());
  for (const n of laid.children) assert.ok(n.width > 0 && n.height > 0 && n.x >= 0 && n.y >= 0, JSON.stringify(n));
});

test("with layoutEngine inline, a built page embeds ELK and no layout", async () => {
  await withLayoutEngine("inline", async (dir) => {
    const { html } = await buildPage(example(), dir);
    assert.doesNotMatch(html, /src="\.\.\/|href="tokens\.css"|data-src=|src="src\//);
    assert.match(html, /<script id="openarc-elk" type="text\/plain">\S/);
    assert.match(html, /<script id="openarc-layout" type="application\/json"><\/script>/);
  });
});

test("placeCards fits each column to its widest card and shifts the columns after it", () => {
  // Two layers as ELK laid them out at 100 wide, 50 apart; the cards turn out 140 and 80 wide.
  const laid = { width: 300, height: 200, children: [
    { id: "c:a", x: 0, y: 0, width: 100, height: 40 }, { id: "c:b", x: 0, y: 80, width: 100, height: 40 },
    { id: "c:c", x: 150, y: 0, width: 100, height: 40 },
  ] };
  const { pos, width } = placeCards(laid, [{ id: "a", w: 140, h: 40 }, { id: "b", w: 80, h: 40 }, { id: "c", w: 80, h: 40 }], 1);
  assert.deepEqual(pos.get("a"), { x: 0, y: 0, w: 140, h: 40 });
  assert.deepEqual(pos.get("b"), { x: 0, y: 80, w: 140, h: 40 });
  assert.deepEqual(pos.get("c"), { x: 190, y: 0, w: 80, h: 40 });
  assert.equal(width, 300 + 40 - 20);
});
