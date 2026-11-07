import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKlar } from "../tools/klar.mjs";
import { CONTROL, DECLARATIONS, VERBS, EFFECTS } from "../viewer/src/klar-vocab.js";

const spec = readFileSync(new URL("../spec/klar.md", import.meta.url), "utf8");
const section = (heading) => spec.slice(spec.indexOf(heading), spec.indexOf("\n#", spec.indexOf(heading) + heading.length));
const codes = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const firstColumn = (text) => text.split("\n").filter((l) => /^\| `/.test(l)).flatMap((l) => codes(l.split("|")[1]));
const sorted = (list) => [...new Set(list)].sort();

test("the vocabulary matches the spec", () => {
  const highlighting = section("## 13. Highlighting").split("\n");
  const row = (name) => codes(highlighting.find((l) => l.startsWith(`| ${name} `)));
  assert.deepEqual(sorted(CONTROL), sorted(row("control")));
  assert.deepEqual(sorted(DECLARATIONS), sorted(row("declaration")));
  assert.deepEqual(sorted(VERBS), sorted(firstColumn(section("### 7.1 Verbs"))));
  const effects = firstColumn(section("## 9.")).map((e) => e.replace(/\s*<.*$/, "").replace(/^depends on .*/, "depends on"));
  assert.deepEqual(sorted(EFFECTS), sorted([...effects, "omits"]));
});

test("parseKlar reads components, members and effects", () => {
  const klar = parseKlar(readFileSync(new URL("../examples/rate-limit/change.klar", import.meta.url), "utf8"));
  const limiter = klar.get("RateLimiter");
  assert.deepEqual([...limiter.members.keys()], ["buckets", "check", "bucketFor"]);
  assert.match(limiter.header.join("\n"), /needs clock/);
  assert.deepEqual(limiter.members.get("check").effects, ["changes buckets", "depends on time"]);
  assert.equal(limiter.members.get("check").lines[0], "  check(client, plan) → allowed | denied");
});

test("parseKlar splits effects before and after a change", () => {
  const klar = parseKlar(["  module m", "~   f()", "      Return 1", "", "-     reads db", "+     writes db · fails NotFound"].join("\n"));
  const f = klar.get("m").members.get("f");
  assert.deepEqual(f.effects, ["writes db", "fails NotFound"]);
  assert.deepEqual(f.baseEffects, ["reads db"]);
});
