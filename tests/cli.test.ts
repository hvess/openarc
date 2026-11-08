import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

test("the plugin manifests and package.json carry one version", () => {
  const versions = ["package.json", ".claude-plugin/plugin.json", "plugin.json"].map((p) => [p, read(p).version]);
  assert.equal(new Set(versions.map(([, v]) => v)).size, 1, versions.map(([p, v]) => `${p}: ${v}`).join(", "));
});

test("both marketplaces list the plugin by its manifest name", () => {
  const name = read(".claude-plugin/plugin.json").name;
  assert.equal(read("plugin.json").name, name);
  assert.deepEqual(read(".claude-plugin/marketplace.json").plugins.map((p: { name: string }) => p.name), [name]);
  assert.deepEqual(read(".agents/plugins/marketplace.json").plugins.map((p: { name: string }) => p.name), [name]);
  assert.ok(existsSync(join(root, "skills/openarc/SKILL.md")));
});

// A throwaway repository on main with two commits: base, then one that changes a.ts and adds b.ts.
type Git = (...args: string[]) => Buffer;
function withRepo(fn: (dir: string, git: Git) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "openarc-cli-"));
  const git: Git = (...args) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, stdio: "pipe" });
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    writeFileSync(join(dir, "b.ts"), "export const b = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "change");
    return fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const openarc = (cwd: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [join(root, "bin/openarc.ts"), ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
};
const filesOf = (dir: string, name: string) => readFileSync(join(dir, ".openarc", name, "files.txt"), "utf8").trim().split("\n");

test("on a clean default branch, new measures the last commit", () => {
  withRepo((dir) => {
    const r = openarc(dir, "new", "last");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /the last commit/);
    assert.deepEqual(filesOf(dir, "last"), ["M\ta.ts", "A\tb.ts"]);
    assert.equal(readFileSync(join(dir, ".openarc/last/before/a.ts"), "utf8"), "export const a = 1;\n");
  });
});

test("uncommitted changes on the default branch are the change", () => {
  withRepo((dir) => {
    writeFileSync(join(dir, "a.ts"), "export const a = 3;\n");
    const r = openarc(dir, "new", "wip");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /uncommitted changes/);
    assert.deepEqual(filesOf(dir, "wip"), ["M\ta.ts"]);
  });
});

test("untracked files are left out unless asked for, even with an explicit base", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, "scratch"));
    writeFileSync(join(dir, "scratch/notes.md"), "notes\n");
    const left = openarc(dir, "new", "explicit", "--base", "HEAD~1");
    assert.equal(left.code, 0, left.out);
    assert.match(left.out, /1 untracked file was left out/);
    assert.deepEqual(filesOf(dir, "explicit"), ["M\ta.ts", "A\tb.ts"]);

    const kept = openarc(dir, "new", "explicit", "--base", "HEAD~1", "--untracked", "--force");
    assert.equal(kept.code, 0, kept.out);
    assert.deepEqual(filesOf(dir, "explicit"), ["M\ta.ts", "A\tb.ts", "A\tscratch/notes.md"]);
  });
});

test("on a branch, new measures from where it left main", () => {
  withRepo((dir, git) => {
    git("checkout", "-qb", "feature");
    writeFileSync(join(dir, "c.ts"), "export const c = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "feature");
    const r = openarc(dir, "new", "feature");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /where this branch left main/);
    assert.deepEqual(filesOf(dir, "feature"), ["A\tc.ts"]);
  });
});

test("new rejects bad arguments with a clear message", () => {
  withRepo((dir) => {
    for (const [args, message] of [
      [["new", "x", "--base"], /--base needs a commit/],
      [["new", "x", "--base", "--force"], /--base needs a commit/],
      [["new", "x", "--bogus"], /unknown option --bogus/],
      [["new", "x", "y"], /one name only/],
      [["new", "Bad Name"], /lowercase letters/],
      [["new", "x", "--base", "nope"], /unknown base nope/],
    ] as [string[], RegExp][]) {
      const r = openarc(dir, ...args);
      assert.equal(r.code, 1, args.join(" "));
      assert.match(r.out, message, args.join(" "));
    }
  });
});
