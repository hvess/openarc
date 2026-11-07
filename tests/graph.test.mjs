import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assembleGraph, checkGraph } from "../tools/graph.mjs";
import { validate } from "../tools/schema.mjs";

const example = new URL("../examples/rate-limit/", import.meta.url).pathname;
const built = () => JSON.parse(readFileSync(join(example, "graph.json"), "utf8"));
const member = (g, id) => g.components.flatMap((c) => c.members).find((m) => m.id === id);

test("the example assembles into a conformant graph identical to graph.json", () => {
  const { graph, problems } = assembleGraph(example);
  assert.deepEqual(problems, []);
  assert.deepEqual(graph, built());
});

test("checkGraph finds each kind of problem", () => {
  const cases = [
    [(g) => { g.components[1].id = g.components[0].id; }, /duplicate id/],
    [(g) => { g.edges[0].to = "nowhere"; }, /unknown id nowhere/],
    [(g) => { g.flows[0].steps.push("nowhere"); }, /unknown step nowhere/],
    [(g) => { g.notes[0].refs = ["nowhere"]; }, /unknown ref nowhere/],
    [(g) => { delete member(g, "RateLimiter.check").summary; }, /missing "summary"/],
    [(g) => { delete member(g, "RateLimiter.check").source; }, /missing "source"/],
    [(g) => { g.edges[0].status = "moved"; }, /must be one of/],
  ];
  for (const [change, expected] of cases) {
    const g = built();
    change(g);
    assert.match(checkGraph(g).join("\n"), expected);
  }
});

test("source lines outside the file are reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "openarc-"));
  try {
    cpSync(example, dir, { recursive: true });
    const src = JSON.parse(readFileSync(join(dir, "graph.src.json"), "utf8"));
    member(src, "RateLimiter.check").source.lines = [20, 400];
    writeFileSync(join(dir, "graph.src.json"), JSON.stringify(src));
    assert.match(assembleGraph(dir).problems.join("\n"), /RateLimiter.check: lines 20–400 are outside/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate handles the schema features OpenArc uses", () => {
  const schema = {
    type: "object", required: ["a"], additionalProperties: false,
    properties: { a: { $ref: "#/$defs/pair" }, b: { enum: ["x"] } },
    $defs: { pair: { type: "array", prefixItems: [{ type: "integer", minimum: 1 }, { type: "string", minLength: 1 }], minItems: 2, maxItems: 2 } },
    if: { properties: { b: { const: "x" } }, required: ["b"] }, then: { required: ["c"] },
  };
  assert.deepEqual(validate({ a: [1, "s"] }, schema), []);
  assert.deepEqual(validate({ a: [0, ""], b: "x", z: 1 }, schema), [
    "$.a[0]: must be at least 1",
    "$.a[1]: must have at least 1 character(s)",
    '$: unknown property "z"',
    '$: missing "c"',
  ]);
});
