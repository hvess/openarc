#!/usr/bin/env node
// The OpenArc command line. The Claude Code and Codex plugins call this, and so will the npm package.
//
//   openarc new <name> [--base <ref>] [--force]   set up .openarc/<name>/ for a change in this git repo
//   openarc build <dir>                           check a change directory and build its viewer page
//   openarc docs                                  print where the specs and the worked example are
//
// Everything is resolved from this file's location, so it runs the same from a checkout,
// a plugin cache or node_modules, and never writes inside its own folder.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChange, report } from "../tools/build.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const DOCS = {
  "graph format": "spec/graph.md",
  "graph schema": "spec/graph.schema.json",
  "Klar": "spec/klar.md",
  "worked example": "examples/rate-limit",
};

const USAGE = `usage:
  openarc new <name> [--base <ref>] [--force]   set up .openarc/<name>/ for a change in this git repo
  openarc build <dir>                           check a change directory and build its viewer page
  openarc docs                                  print where the specs and the worked example are`;

function die(message) {
  console.error(message);
  process.exit(1);
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: opts.buffer ? "buffer" : "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });
}

function tryGit(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

// The point the change is measured from: where this branch left the default branch, or the
// last commit when the branch is the default branch (so only uncommitted work counts).
function defaultBase() {
  const head = tryGit(["rev-parse", "HEAD"]);
  for (const ref of ["origin/HEAD", "main", "master"]) {
    const mb = tryGit(["merge-base", "HEAD", ref]);
    if (mb && mb !== head) return mb;
  }
  return "HEAD";
}

// Files that differ between base and the working tree, untracked ones included, as [status, path, basePath].
function changedFiles(base) {
  const out = git(["diff", "--name-status", "-z", "-M", base, "--"]).split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < out.length; ) {
    const status = out[i++];
    if (status[0] === "R" || status[0] === "C") {
      const from = out[i++], to = out[i++];
      files.push([status[0], to, from]);
    } else {
      const path = out[i++];
      files.push([status[0], path, status[0] === "A" ? null : path]);
    }
  }
  for (const path of git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) {
    files.push(["A", path, null]);
  }
  return files.filter(([, path]) => !path.startsWith(".openarc/"));
}

function cmdNew(args) {
  const name = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
  const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) die(`${USAGE}\n\n<name> is lowercase letters, digits and hyphens, e.g. rate-limit`);

  const repo = tryGit(["rev-parse", "--show-toplevel"]);
  if (!repo) die("openarc new runs inside a git repository");
  process.chdir(repo);

  const base = baseArg ?? defaultBase();
  const baseSha = tryGit(["rev-parse", "--verify", `${base}^{commit}`]);
  if (!baseSha) die(`unknown base ${base}`);

  const dir = join(repo, ".openarc", name);
  if (existsSync(join(dir, "graph.src.json")) && !args.includes("--force")) {
    die(`${relative(process.cwd(), dir)} already exists; pass --force to set it up again (this overwrites graph.src.json and change.klar)`);
  }

  const files = changedFiles(baseSha);
  if (!files.length) die(`nothing differs from ${base}`);

  mkdirSync(join(dir, "before"), { recursive: true });
  writeFileSync(join(repo, ".openarc", ".gitignore"), "*\n");

  for (const [, , basePath] of files) {
    if (!basePath) continue;
    const target = join(dir, "before", basePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git(["show", `${baseSha}:${basePath}`], { buffer: true }));
  }
  writeFileSync(join(dir, "change.diff"), git(["diff", "-M", baseSha, "--"]));
  writeFileSync(join(dir, "files.txt"), files.map(([s, path, from]) => (from && from !== path ? `${s}\t${from} -> ${path}` : `${s}\t${path}`)).join("\n") + "\n");

  writeFileSync(join(dir, "graph.src.json"), JSON.stringify({
    openarc: "0.1",
    change: { title: "", summary: "", base: "before", head: relative(dir, repo), klar: "change.klar" },
    groups: [],
    components: [],
    edges: [],
    flows: [],
    notes: [],
  }, null, 2) + "\n");
  writeFileSync(join(dir, "change.klar"), "klar 0.2\n");

  const rel = relative(process.cwd(), dir);
  console.log(`✓ ${rel}/ for ${files.length} changed file${files.length === 1 ? "" : "s"} since ${base === baseSha ? baseSha.slice(0, 12) : `${base} (${baseSha.slice(0, 12)})`}

  files.txt        what changed: A added, M modified, D deleted, R renamed
  change.diff      the full diff
  before/          the base version of every file that existed before
  graph.src.json   structure: write components, members, edges, flows and notes here
  change.klar      meaning: write the Klar for the change here

Source line ranges point into the working tree (head) and before/ (base).
Then run: openarc build ${rel}`);
  printDocs();
}

function cmdBuild(args) {
  const dir = args[0];
  if (!dir) die(USAGE);
  if (!existsSync(join(dir, "graph.src.json"))) die(`${dir} has no graph.src.json; set one up with openarc new <name>`);
  const result = buildChange(resolve(dir));
  if (result.problems.length) {
    console.error(`${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}:\n${report(result)}`);
    process.exit(1);
  }
  console.log(report(result));
}

function printDocs() {
  console.log("\nReference:");
  for (const [label, path] of Object.entries(DOCS)) console.log(`  ${label.padEnd(15)} ${join(root, path)}`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "new": cmdNew(args); break;
  case "build": cmdBuild(args); break;
  case "docs": printDocs(); break;
  case undefined: case "help": case "--help": case "-h": console.log(USAGE); break;
  default: die(`unknown command ${command}\n\n${USAGE}`);
}
