// Load openarc.config.json.
//
// OpenArc looks for the file in the given directory and then in each parent, and uses
// the first one it finds. Settings that are left out take their defaults, and unknown
// settings or values are errors, so a typo never silently does nothing.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export const CONFIG_FILE = "openarc.config.json";
export const DEFAULTS = { theme: "system" };

export function findConfig(start) {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, CONFIG_FILE);
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(start, { themes }) {
  const file = findConfig(start);
  const raw = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const problems = [];

  for (const key of Object.keys(raw)) {
    if (key !== "$schema" && !(key in DEFAULTS)) problems.push(`unknown setting "${key}"`);
  }
  const config = { ...DEFAULTS, ...raw };
  delete config.$schema;

  const allowed = ["system", ...themes];
  if (typeof config.theme !== "string" || !allowed.includes(config.theme)) {
    problems.push(`theme must be one of ${allowed.map((t) => `"${t}"`).join(", ")}; got ${JSON.stringify(config.theme)}`);
  }

  if (problems.length) {
    throw new Error(`${file ?? CONFIG_FILE}: ${problems.join("; ")}`);
  }
  return { config, file };
}
