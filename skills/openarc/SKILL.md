---
name: openarc
description: Turn a code change into an interactive OpenArc architecture diagram for review — the components it adds, changes or removes, how control flows through them, Klar pseudocode for each function, and the risks to weigh. Use when the user asks to diagram, map, visualise or explain the architecture of a change, branch, PR or diff, or asks for an OpenArc.
---

# OpenArc

You are producing an OpenArc for a code change: a graph of its architecture and a single HTML page that shows it. The structure (components, edges, source lines) must match the code exactly; the meaning (summaries, Klar, flows, notes) is yours to write. The build checks the structure, so run it and fix what it reports until it passes.

## The CLI

The OpenArc CLI is `bin/openarc.ts`, two folders up from the folder this file is in (`<this skill's folder>/../../bin/openarc.ts`). Work out its absolute path once and use it for every command below; it needs Node 22.18 or later, which runs TypeScript directly, and nothing else. In this file, `openarc` means `node <that path>`.

## Steps

1. **Pick the change.** On a branch, the default is everything since it left the default branch, plus uncommitted changes to tracked files. On the default branch itself, it's the uncommitted changes, or the last commit if there are none. If the user named a commit, branch or PR base, use that as `--base`. Choose a short name for it, such as `rate-limit`.

2. **Set it up.** Run `openarc new <name>` from inside the repository, with `--base <ref>` if needed. It creates `.openarc/<name>/` (git-ignored) with the list of changed files, the diff, the base versions of those files in `before/`, and empty `graph.src.json` and `change.klar`. It prints how the base was chosen and where the specs are. Files git doesn't track are left out, and it says how many. If the user's new files are among them, run it again with `--untracked --force`; don't pull in unrelated scratch files.

3. **Read the specs before writing anything.** Read the graph format (`spec/graph.md`) and Klar (`spec/klar.md`) in full, and look at the worked example's `graph.src.json` and `change.klar` (`examples/rate-limit`). `openarc docs` prints their paths again.

4. **Read the change.** Read `files.txt`, `change.diff` and the changed files themselves, then the code they call into and are called from, one hop out.

5. **Write the structure in `graph.src.json`.** Fill in `change.title` and `change.summary`, then the components and members the change adds, changes or removes, plus the unchanged context they connect to, usually one hop away. Don't map the whole codebase. For each member:
   - `source.lines` is the line range in the working tree. `base.lines` is the range in `before/`, required for removed members and recommended for changed ones. Read the files to get the lines exactly; never estimate them.
   - A range covers that member and nothing else. For a setting in a config file, that's its own lines, not the neighbouring settings.
   - Leave out `code`; the build copies it from the files.

   Files that aren't code are components of kind `file`, named by their path (`"name": ".claude-plugin/plugin.json"`):
   - **Configuration** (JSON, TOML, YAML, manifests, stylesheets) gets a `const` member for each setting that matters, named by its key.
   - **Prose** (Markdown, plain text, docs, ADRs, written instructions) gets a `section` member for each section the change touches or relies on, named by its heading exactly as written (`"name": "Install on Linux"`), never an invented identifier. A part with no heading of its own, such as a list item or a numbered decision, is named by the label it starts with (`"5. Releases stay in this private repository"`). The range covers the part's own lines: a heading and its text up to the next heading of the same or a higher level, or the whole list item.

   Edges between prose sections are `inferred` unless one actually links to the other, and their `label` says what the reference is ("points readers to LICENSE").

   Write edges between members, and mark every edge you didn't read directly from a call or import as `dispatch` or `inferred`.

   Add one or more flows that tell the story of the change. A flow is one path that really happens, in order. Where there are alternatives, such as two hosts, two commands or a success and a failure, give each its own flow rather than chaining them.

   Add notes for the risks and behaviour changes a reviewer should weigh.

6. **Write the meaning in `change.klar`.** Write a Klar block for every added, changed and removed member, following the Klar spec: one action per line, names from the code, effects stated. A `file` component's header is `file "<path>"`, with its quoted path. A prose section is `section "<heading>"`, and its body says what the section says, one point per line in the file's own words, with `+` and `-` for what the change adds and removes; it has no verbs or effects footer. Each added or changed member needs a one-line `summary` in `graph.src.json`. A component's summary can come from its Klar doc line instead.

7. **Build until it passes.** Run `openarc build .openarc/<name>`. It lists every problem (schema errors, unknown ids, line ranges outside a file, missing Klar). Fix each one and run it again. Don't loosen the graph to get past a check, for example by deleting a member whose lines you couldn't place; find the right lines instead.

8. **Hand it over.** Tell the user the path to `.openarc/<name>/index.html`. It's a single self-contained page that they can open in a browser or attach to a review. Open it for them only if they ask. Mention any edges you marked `inferred` and anything you left out.

## Ground rules

- The diagram is for a reviewer. Prefer fewer, well-named components and a clear flow over completeness.
- Never invent structure. If you can't find where something is called from, leave the edge out or mark it `inferred` with a `label` saying why.
- Write only inside `.openarc/<name>/`. Don't change the user's code.
