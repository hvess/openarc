#!/usr/bin/env node
// The OpenArc command line. The Claude Code and Codex plugins call this, and so will the npm package.
//
//   openarc new <name> [--base <ref>] [--untracked] [--force]
//                                                 set up .openarc/<name>/ for a change in this git repo
//   openarc build <dir>                           check a change directory and build its viewer page
//   openarc docs                                  print where the specs and the worked example are
//
// Everything is resolved from this file's location, so it runs the same from a checkout,
// a plugin cache or node_modules, and never writes inside its own folder.

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChange, report } from "../tools/build.ts";

// [status, path, basePath]: A added, M modified, D deleted, R renamed, C copied. basePath is
// null for a file that did not exist at the base.
type ChangedFile = [string, string, string | null];

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const DOCS: Record<string, string> = {
  "graph format": "spec/graph.md",
  "graph schema": "spec/graph.schema.json",
  "Klar": "spec/klar.md",
  "worked example": "examples/rate-limit",
};

const USAGE = `usage:
  openarc new <name> [--base <ref>] [--untracked] [--force]
                                                set up .openarc/<name>/ for a change in this git repo
                                                --base       compare against this commit (default: where
                                                             the branch left main, or the last commit)
                                                --untracked  include files git doesn't track yet
  openarc build <dir>                           check a change directory and build its viewer page
  openarc docs                                  print where the specs and the worked example are`;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(args: string[]): string;
function git(args: string[], opts: { buffer: true }): Buffer;
function git(args: string[], opts: { buffer?: boolean } = {}): string | Buffer {
  const options: ExecFileSyncOptions = { maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] };
  return opts.buffer ? execFileSync("git", args, options) as Buffer : execFileSync("git", args, { ...options, encoding: "utf8" });
}

function tryGit(args: string[]): string | null {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

// The point the change is measured from, and why:
// - on a branch, where it left the default branch;
// - level with the default branch, the last commit if there's uncommitted work to show, or
//   else the commit before it, so the change is the last commit.
function defaultBase(): { base: string; why: string } {
  const head = tryGit(["rev-parse", "HEAD"]);
  if (!head) die("this repository has no commits yet");
  for (const ref of ["origin/HEAD", "main", "master"]) {
    const mb = tryGit(["merge-base", "HEAD", ref]);
    if (mb && mb !== head) return { base: mb, why: `where this branch left ${ref}` };
  }
  if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) return { base: "HEAD", why: "uncommitted changes" };
  if (!tryGit(["rev-parse", "--verify", "--quiet", "HEAD~1"])) die("there's only one commit and nothing uncommitted; pass --base to say what to compare against");
  return { base: "HEAD~1", why: "the last commit" };
}

function untrackedFiles(): string[] {
  return git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter((p) => p && !p.startsWith(".openarc/"));
}

// Tracked files that differ between base and the working tree, as [status, path, basePath].
// Untracked files only with { untracked: true }: they're often scratch work, and `git add`
// is how a new file joins the change.
function changedFiles(base: string, { untracked }: { untracked: boolean }): ChangedFile[] {
  const out = git(["diff", "--name-status", "-z", "-M", base, "--"]).split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
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
  if (untracked) for (const path of untrackedFiles()) files.push(["A", path, null]);
  return files.filter(([, path]) => !path.startsWith(".openarc/"));
}

interface NewOptions { name: string | null; base: string | null; force: boolean; untracked: boolean }

function parseNewArgs(args: string[]): NewOptions & { name: string } {
  const opts: NewOptions = { name: null, base: null, force: false, untracked: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--base") {
      const value = args[++i];
      if (!value || value.startsWith("--")) die("--base needs a commit, branch or tag, e.g. --base main");
      opts.base = value;
    } else if (a === "--force") opts.force = true;
    else if (a === "--untracked") opts.untracked = true;
    else if (a.startsWith("-")) die(`unknown option ${a}\n\n${USAGE}`);
    else if (opts.name) die(`one name only; got ${opts.name} and ${a}`);
    else opts.name = a;
  }
  if (!opts.name || !/^[a-z0-9][a-z0-9-]*$/.test(opts.name)) die(`${USAGE}\n\n<name> is lowercase letters, digits and hyphens, e.g. rate-limit`);
  return { ...opts, name: opts.name };
}

function cmdNew(args: string[]): void {
  const { name, base: baseArg, force, untracked } = parseNewArgs(args);

  const repo = tryGit(["rev-parse", "--show-toplevel"]);
  if (!repo) die("openarc new runs inside a git repository");
  process.chdir(repo);

  const { base, why } = baseArg ? { base: baseArg, why: null } : defaultBase();
  const baseSha = tryGit(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (!baseSha) die(`unknown base ${base}`);

  const dir = join(repo, ".openarc", name);
  if (existsSync(join(dir, "graph.src.json")) && !force) {
    die(`${relative(process.cwd(), dir)} already exists; pass --force to set it up again (this overwrites graph.src.json and change.klar)`);
  }

  const files = changedFiles(baseSha, { untracked });
  const leftOut = untracked ? 0 : untrackedFiles().length;
  const untrackedHint = leftOut
    ? `${leftOut} untracked file${leftOut === 1 ? " was" : "s were"} left out. If any belong to the change, git add them or pass --untracked.`
    : "";
  if (!files.length) die(`nothing differs from ${base}${untrackedHint ? `. ${untrackedHint}` : ""}`);

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
  const since = base === baseSha ? baseSha.slice(0, 12) : `${base} (${baseSha.slice(0, 12)})`;
  console.log(`✓ ${rel}/ for ${files.length} changed file${files.length === 1 ? "" : "s"} since ${since}${why ? `, ${why}` : ""}${untrackedHint ? `\n  ${untrackedHint}` : ""}

  files.txt        what changed: A added, M modified, D deleted, R renamed
  change.diff      the full diff
  before/          the base version of every file that existed before
  graph.src.json   structure: write components, members, edges, flows and notes here
  change.klar      meaning: write the Klar for the change here

Source line ranges point into the working tree (head) and before/ (base).
Then run: openarc build ${rel}`);
  printDocs();
}

async function cmdBuild(args: string[]): Promise<void> {
  const dir = args[0];
  if (!dir) die(USAGE);
  if (!existsSync(join(dir, "graph.src.json"))) die(`${dir} has no graph.src.json; set one up with openarc new <name>`);
  const result = await buildChange(resolve(dir));
  if (result.problems.length) {
    console.error(`${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}:\n${report(result)}`);
    process.exit(1);
  }
  console.log(report(result));
}

function printDocs(): void {
  console.log("\nReference:");
  for (const [label, path] of Object.entries(DOCS)) console.log(`  ${label.padEnd(15)} ${join(root, path)}`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "new": cmdNew(args); break;
  case "build": await cmdBuild(args); break;
  case "docs": printDocs(); break;
  case undefined: case "help": case "--help": case "-h": console.log(USAGE); break;
  default: die(`unknown command ${command}\n\n${USAGE}`);
}
