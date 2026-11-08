// Load openarc.config.json.
//
// OpenArc looks for the file in the given directory and then in each parent, and uses the first
// one it finds. spec/config.schema.json defines every setting and its default. Settings that are
// left out take their defaults, and unknown settings or values are errors, so a typo never
// silently does nothing.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate, type Schema } from "./schema.ts";

export interface Config {
  theme: string;
  layoutEngine: "build" | "inline" | "cdn";
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA: Schema = JSON.parse(readFileSync(join(root, "spec/config.schema.json"), "utf8"));

export const CONFIG_FILE = "openarc.config.json";
export const DEFAULTS = Object.fromEntries(
  Object.entries(SCHEMA.properties ?? {}).filter(([, s]) => "default" in s).map(([k, s]) => [k, s.default]),
) as unknown as Config;

export function findConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, CONFIG_FILE);
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// themes lists the theme names in design/themes/, which the schema cannot know.
export function loadConfig(start: string, { themes }: { themes: string[] }): { config: Config; file: string | null } {
  const file = findConfig(start);
  const raw: Record<string, unknown> = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const problems = validate(raw, SCHEMA);

  const { $schema: _, ...rest } = raw;
  const config = { ...DEFAULTS, ...rest } as Config;
  const allowed = ["system", ...themes];
  if (!allowed.includes(config.theme)) {
    problems.push(`$.theme: must be one of ${allowed.map((t) => `"${t}"`).join(", ")}; got ${JSON.stringify(config.theme)}`);
  }

  if (problems.length) throw new Error(`${file ?? CONFIG_FILE}: ${problems.join("; ")}`);
  return { config, file };
}
