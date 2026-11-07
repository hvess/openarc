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
| [`viewer/index.html`](viewer/index.html) | A self-contained viewer: pan, zoom, flows, a function inspector |
| [`tools/build.mjs`](tools/build.mjs) | Joins a graph, its Klar document and the source into a finished graph and viewer page |
| [`examples/rate-limit`](examples/rate-limit) | A worked example: adding a token-bucket rate limiter to a small TypeScript API |

## Try the example

```bash
node tools/build.mjs examples/rate-limit
```

Then serve the folder and open `examples/rate-limit/index.html`. The viewer loads its layout engine from a CDN, so open it over HTTP rather than as a file:

```bash
python3 -m http.server 4719
```

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
