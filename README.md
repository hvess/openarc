<p align="center">
  <img src="docs/logo.svg" width="96" height="96" alt="OpenArc logo">
</p>

<h1 align="center">OpenArc</h1>

<p align="center">
  <strong>Review a code change by its architecture, not line by line.</strong>
</p>

<p align="center">
  <img alt="Version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-4353d6">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Node 22.18 or later" src="https://img.shields.io/badge/node-%E2%89%A522.18-339933?logo=node.js&logoColor=white">
</p>

---

A diff shows you which lines changed. It doesn't show you what the change does to the shape of the code. OpenArc turns a code change into an interactive architecture diagram, saved as one self-contained HTML page. It shows:

- **Components** the change adds, changes or removes, and where they connect to the existing code
- **Flows** of control through them, as named paths you can step through
- **Functions** described in [Klar](spec/klar.md), a plain pseudocode that shows intent, mutation and side effects
- **Risks** and behaviour changes a reviewer should weigh

The source stays one click away, so you can always check the description against the code.

> [!NOTE]
> OpenArc is in early design. Klar (0.2) and the graph format (0.1) are drafts and will change.

## Install

OpenArc is a plugin for Claude Code and Codex. It needs Node 22.18 or later.

**Claude Code:**

```
/plugin install openarc --marketplace hvess/openarc
```

**Codex:** run the command below, then install OpenArc from `/plugins`.

```bash
codex plugin marketplace add hvess/openarc
```

## Usage

In any git repository, ask your agent:

> Make an OpenArc for the changes on this branch

You can also invoke the skill directly with `/openarc:openarc` in Claude Code or `$openarc` in Codex. It writes `.openarc/<name>/index.html`, which you can open in a browser or attach to a review. The `.openarc/` folder ignores itself in git.

### Try the example

[`examples/rate-limit`](examples/rate-limit) adds a token-bucket rate limiter to a small TypeScript API. Clone this repository and run:

```bash
npm run build && npm run serve
```

Then open <http://localhost:4719/examples/rate-limit/>.

## How it works

1. **Collect the change.** OpenArc takes the diff from git, along with the files as they were before it.
2. **Map the structure.** The agent records the components and functions the change touches, what calls what, and the exact source lines of each.
3. **Add the meaning.** The agent describes each function in Klar, then adds summaries, flows and review notes.
4. **Build the page.** OpenArc checks the structure against the code, then builds the viewer into one HTML file.

Because the build checks the structure, every description points to the code it describes. Any connection the agent couldn't read directly from the code is marked as inferred. The [graph format](spec/graph.md) and [Klar](spec/klar.md) specs have the details.

## Configuration

Put an optional `openarc.config.json` next to the change, or in any parent directory:

```json
{
  "$schema": "./spec/config.schema.json",
  "theme": "system"
}
```

| Setting | Default | |
|---|---|---|
| `theme` | `"system"` | `"light"`, `"dark"`, `"system"` or any theme in [`design/themes/`](design/themes) |
| `layoutEngine` | `"build"` | `"build"` lays the diagram out ahead of time, so the page opens at once. `"inline"` or `"cdn"` lay it out in the browser |

## Contributing

Issues and pull requests are welcome. Because the formats are still drafts, it's best to open an issue before changing [Klar](spec/klar.md) or the [graph format](spec/graph.md).

OpenArc is written in TypeScript, and there's no compile step: Node runs it directly.

| Command | |
|---|---|
| `npm test` | Run the tests |
| `npm run check` | Check the design tokens and colour contrast |
| `npm run typecheck` | Check types (run `npm install` first) |
| `npm run build` | Build the example |
| `npm run serve` | Serve the repository on port 4719 |

## License

[MIT](LICENSE). The bundled [ELK](vendor/elkjs/LICENSE.md) layout engine is under EPL-2.0.
