# OpenArc

OpenArc turns a code change into an interactive architecture diagram, so reviewers can judge a change by its structure and direction instead of line by line.

A diff tells you which lines changed. OpenArc tells you:

- **which components** the change adds, changes or removes, and where they connect to the existing code
- **how control flows** through them, as named paths you can step through
- **what each function does**, written in **Klar**, a plain pseudocode that shows intent, mutation and side effects without the noise of the source language
- **what to think about**: risks and behaviour changes the reviewer should weigh

The raw code is still there for checking the Klar against it, one click away, but it's not the main view.

## What's here

| Path | |
|---|---|
| [`spec/klar.md`](spec/klar.md) | **Klar 0.2**: the language for describing code in simpler terms |
| [`spec/graph.md`](spec/graph.md), [`spec/graph.schema.json`](spec/graph.schema.json) | **OpenArc Graph 0.1**: the JSON format for a change's architecture |
| [`viewer/`](viewer) | The viewer: pan, zoom, flows, a function inspector. [`index.html`](viewer/index.html) is the page and [`src/`](viewer/src) its modules |
| [`design/`](design) | The design system: tokens for grid, spacing, type, colour and viewer behaviour, and one file per theme |
| [`tools/`](tools) | The build, the design checks, and the readers they share (Klar, JSON Schema, config) |
| [`tests/`](tests) | Tests for the tools, run with Node's built-in runner |
| [`bench/`](bench) | Synthetic graphs of any size and a script that times the viewer on them |
| [`vendor/elkjs`](vendor/elkjs) | ELK 0.9.3, the layout engine, pinned (EPL-2.0) |
| [`bin/openarc.mjs`](bin/openarc.mjs) | The command line: `new` sets up a change from git, `build` checks it and builds its page |
| [`skills/openarc`](skills/openarc/SKILL.md) | The skill that drives an agent through a change, shared by the Claude Code and Codex plugins |
| [`.claude-plugin/`](.claude-plugin), [`plugin.json`](plugin.json), [`.agents/plugins/`](.agents/plugins) | Plugin and marketplace manifests for Claude Code and Codex |
| [`examples/rate-limit`](examples/rate-limit) | A worked example: adding a token-bucket rate limiter to a small TypeScript API |

## Install the plugin

This repository is its own plugin marketplace for Claude Code and Codex. Both install the same skill, which needs Node 20 or later.

In Claude Code:

```
/plugin install openarc --marketplace hvess/openarc
```

In Codex, add the marketplace, then install OpenArc from `/plugins` and start a new session:

```bash
codex plugin marketplace add hvess/openarc
```

Then ask for an OpenArc of your branch, or invoke the skill directly (`/openarc:openarc` in Claude Code, `$openarc` in Codex). It writes `.openarc/<name>/index.html` in your repository; `.openarc/` ignores itself in git.

## Try the example

```bash
npm run build
```

This writes `examples/rate-limit/graph.json` and `examples/rate-limit/index.html`, a single page with the graph, the viewer and its layout engine inlined. Serve the folder and open it:

```bash
npm run serve
```

OpenArc has no dependencies to install; everything runs on Node 20 or later.

| Command | |
|---|---|
| `npm run build` | Build the example. `node tools/build.mjs <dir>` builds any example directory |
| `npm run check` | Check the design system: the viewer's CSS uses tokens only, and every colour pairing meets WCAG contrast |
| `npm test` | Run the tests |
| `npm run bench` | Generate 25- to 200-component graphs in `bench/out/` for measuring the viewer; [`bench/generate.mjs`](bench/generate.mjs) says how |

The build fails if the graph doesn't conform to [the spec](spec/graph.md#10-conformance): it validates against the schema, ids are unique, every reference resolves, and every source line range exists.

To work on the viewer without building, serve the repository and open `viewer/index.html?src=../examples/rate-limit/graph.json`. It loads its modules and stylesheet directly.

## Configuration

OpenArc reads `openarc.config.json` from the directory it builds, or the nearest parent directory that has one. Every setting is optional, and the [schema](spec/config.schema.json) gives editors completion and checking.

```json
{
  "$schema": "./spec/config.schema.json",
  "theme": "system"
}
```

| Setting | Default | |
|---|---|---|
| `theme` | `"system"` | `"system"` follows the reader's light or dark setting. `"light"`, `"dark"` or the name of any theme in [`design/themes/`](design/themes) fixes it |
| `layoutEngine` | `"inline"` | `"inline"` embeds the layout engine, so a built page is one file that needs no CDN (about 1.6 MB, 470 kB compressed). `"cdn"` loads it from jsDelivr when the page opens |

Unknown settings and values stop the build, so a typo never goes unnoticed.

## How it fits together

```
code diff ──▶ structure ──────────▶ graph.json ──▶ viewer
               (components, edges,      ▲
                source lines)           │
                                   meaning
                         (Klar, summaries, flows, notes)
```

**Structure** is mechanical and checkable: what was added, what calls what, and which lines each piece comes from. **Meaning** is written by an agent (Claude Code, Codex and others) and kept honest by the structure. Every function in the graph points to the source lines its Klar describes, and every edge that wasn't resolved from the code is marked as inferred.

In this first milestone the example is written by hand to pin down the formats. Extraction and the agent plugin come next.

## Status

Early design. Klar is at 0.2 and the graph format at 0.1; both are drafts and will change.
