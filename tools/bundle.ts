// Bundle the viewer's ES modules into one script, so a built page needs no other files.
//
// TypeScript modules have their types stripped first, by Node's own stripper, which replaces each
// annotation with spaces; nothing else about the code changes. Each imported module then becomes
// a function scope that returns its exports, and each import becomes a read from that object, so
// modules keep their own top-level names. The entry module stays at the top level, where it may
// use top-level await. Only the forms the viewer uses are supported, and anything else is an
// error:
//
//   import { a, b as c } from "./x.ts";
//   import type { … } from "./x.ts";               (removed with the other types)
//   export const | let | function | async function | class name
//   export type | interface name                   (removed with the other types)

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*"(\.{1,2}\/[^"]+)";?[ \t]*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

interface Module { name: string; code: string; exports: string[] }

// TypeScript source as JavaScript. Node marks stripTypeScriptTypes experimental and warns once
// per process; the warning says nothing a build should show.
export function stripTypes(code: string): string {
  const emit = process.emitWarning;
  process.emitWarning = (() => {}) as typeof process.emitWarning;
  try {
    return stripTypeScriptTypes(code, { mode: "strip" });
  } finally {
    process.emitWarning = emit;
  }
}

export function readModule(file: string): string {
  const src = readFileSync(file, "utf8");
  return file.endsWith(".ts") ? stripTypes(src) : src;
}

export function bundle(entry: string): string {
  const modules = new Map<string, Module>(), visiting = new Set<string>(), names = new Set<string>();

  function visit(file: string): string {
    const seen = modules.get(file);
    if (seen) return seen.name;
    if (visiting.has(file)) throw new Error(`import cycle through ${file}`);
    visiting.add(file);
    const src = readModule(file);
    if (/^\s*(import|export)\b/m.test(src.replace(IMPORT, "").replace(EXPORT, ""))) {
      throw new Error(`${file}: only "import { … } from "./…";" and "export const|let|function|class" are supported`);
    }
    const code = src.replace(IMPORT, (_, list: string, spec: string) => {
      const dep = visit(resolve(dirname(file), spec));
      const bindings = list.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ": "));
      return `const { ${bindings.join(", ")} } = ${dep};`;
    });
    const name = "__" + basename(file).replace(/\W/g, "_");
    if (names.has(name)) throw new Error(`two modules are called ${basename(file)}`);
    names.add(name);
    modules.set(file, { name, code: code.replace(/^export\s+/gm, ""), exports: [...src.matchAll(EXPORT)].map((m) => m[1]) });
    visiting.delete(file);
    return name;
  }

  const main = resolve(entry);
  visit(main);
  return [...modules].map(([file, m]) => file === main
    ? m.code
    : `const ${m.name} = (() => {\n${m.code}\nreturn { ${m.exports.join(", ")} };\n})();\n`).join("\n");
}

// Throws if the bundle is not valid JavaScript, for example when a module is malformed.
export function checkSyntax(code: string): void {
  const dir = mkdtempSync(join(tmpdir(), "openarc-"));
  try {
    const file = join(dir, "viewer.mjs");
    writeFileSync(file, code);
    const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`the bundled viewer does not parse:\n${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
