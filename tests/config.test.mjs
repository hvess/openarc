import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, DEFAULTS } from "../tools/config.mjs";

const themes = ["light", "dark"];
function withConfig(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), "openarc-"));
  try {
    if (content !== undefined) writeFileSync(join(dir, "openarc.config.json"), JSON.stringify(content));
    mkdirSync(join(dir, "nested"));
    return fn(join(dir, "nested"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("defaults come from the schema", () => {
  assert.deepEqual(DEFAULTS, { theme: "system", layoutEngine: "inline" });
});

test("a parent directory's file is found and merged over the defaults", () => {
  withConfig({ $schema: "x", theme: "dark" }, (dir) => {
    const { config, file } = loadConfig(dir, { themes });
    assert.deepEqual(config, { theme: "dark", layoutEngine: "inline" });
    assert.match(file, /openarc\.config\.json$/);
  });
});

test("unknown settings and values are errors", () => {
  withConfig({ them: "dark" }, (dir) => assert.throws(() => loadConfig(dir, { themes }), /unknown property "them"/));
  withConfig({ theme: "sepia" }, (dir) => assert.throws(() => loadConfig(dir, { themes }), /theme: must be one of "system", "light", "dark"/));
  withConfig({ layoutEngine: "local" }, (dir) => assert.throws(() => loadConfig(dir, { themes }), /layoutEngine: must be one of "inline", "cdn"/));
});
