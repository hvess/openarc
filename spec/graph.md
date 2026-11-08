# OpenArc Graph 0.1

*Draft. Status: open for comment.*

An OpenArc graph describes the architecture of a code change: the components it touches, what they contain, how they call each other, and the paths a reviewer should follow through them. It is plain JSON, so any tool can produce or render it. The [JSON Schema](graph.schema.json) is the normative definition of its shape; this document explains what the fields mean.

A graph is usually written as `<name>.openarc.json` or `graph.json`.

```json
{
  "openarc": "0.1",
  "change": { "title": "…", "summary": "…" },
  "components": [ … ],
  "edges": [ … ],
  "flows": [ … ],
  "notes": [ … ]
}
```

## 1. Principles

1. **The graph is about the change.** It holds everything the change added, changed or removed, plus enough unchanged **context** to show where the new pieces connect, usually one hop away. It is not a map of the whole codebase.
2. **Structure is checkable and meaning is labelled.** Components, members, edges and source lines can be produced and checked mechanically. Summaries, Klar and notes are written by a person or an agent. Where an edge is asserted rather than resolved from the code, the graph says so (§ 6).
3. **Klar first, code second.** Every member carries its Klar. Raw code is optional and exists so the reader can verify the Klar.
4. **Renderers are interchangeable.** The bundled viewer is one renderer. A graph must make sense without it.

## 2. Identifiers

Every component and every member has an `id` that is unique across the graph.

- Component ids are free-form; the component's name is conventional (`RateLimiter`, `orders`).
- Member ids are conventionally `<componentId>.<memberName>` (`RateLimiter.check`, `db.orders.insert`).

Edges, flows and notes refer to components and members only by id.

## 3. Status

Components, members and edges carry a `status`:

| Status | Meaning |
|---|---|
| `added` | Introduced by the change |
| `changed` | Exists before and after, and differs |
| `removed` | Exists only before the change |
| `context` | Untouched by the change, included to show where it connects |

A component's status summarises its members. A component is `changed` if it is not itself added or removed and any of its members are.

## 4. `change`

| Field | Required | |
|---|---|---|
| `title` | yes | One line saying what the change does |
| `summary` | yes | Two to four sentences in plain language: what the change does, why, and what it replaces |
| `base`, `head` | no | References to the before and after versions (commits, branches, directories) |

## 5. `components`

| Field | Required | |
|---|---|---|
| `id` | yes | Unique id |
| `name` | yes | Display name |
| `kind` | yes | `class`, `interface`, `module`, `record`, `enum`, `external` or `file`, as in [Klar § 5](klar.md#5-components). A `file` component's `name` is its path |
| `status` | yes | § 3 |
| `file` | no | Path of the defining file, relative to the repository root |
| `group` | no | Id of a `groups` entry, such as a package or directory |
| `summary` | no | One sentence saying what the component is for |
| `klar` | no | The component's Klar header (declaration, description, `needs`, `state`) |
| `members` | yes | Array of members, in the order a reader should meet them |

### 5.1 Members

| Field | Required | |
|---|---|---|
| `id` | yes | Unique id |
| `name` | yes | Display name |
| `kind` | yes | `function`, `const`, `state`, `type`, or `section` for a part of a prose file, named by its heading ([Klar § 5](klar.md#5-components)) |
| `status` | yes | § 3 |
| `signature` | no | Inputs and result as in a [Klar signature](klar.md#6-signatures), such as `(client, plan) → allowed | denied` |
| `visibility` | no | `public` (default) or `private` |
| `summary` | no* | One sentence saying what the member does. Klar has no description lines, so this is where it lives. *Required for added and changed functions |
| `klar` | no* | The member's Klar block, gutter included. *Required for added and changed functions |
| `effects` | no | Effects after the change, as in [Klar § 9](klar.md#9-effects) (`["changes buckets", "depends on time"]`). An empty array means no effects |
| `baseEffects` | no | Effects before the change, when they differ |
| `source` | no* | Where the member is in the head version: `{ "file"?, "lines": [start, end], "code"? }`. *Required unless `removed` |
| `base` | no | The same, for the base version. Required for `removed`, recommended for `changed` |

`source.file` and `base.file` default to the component's `file`. `code` holds the source text of those lines. Renderers should show it only on request.

## 6. `edges`

An edge is a directed relationship between two ids, each a component or a member.

| Field | Required | |
|---|---|---|
| `from`, `to` | yes | Ids |
| `kind` | yes | See below |
| `status` | yes | § 3. An edge is `added` if the relationship is new, even when both ends already existed |
| `resolution` | no | How the edge is known; see below. Default `static` |
| `label` | no | A short note, such as `via middleware chain` |

| Kind | Meaning |
|---|---|
| `calls` | `from` invokes `to` |
| `creates` | `from` constructs an instance of `to` |
| `reads` | `from` reads `to` (a constant, state, or a store) |
| `writes` | `from` changes `to` |
| `implements` | `from` fulfils the contract `to` |
| `extends` | `from` inherits from `to` |
| `uses` | Any other dependency, such as a type reference |

| Resolution | Meaning |
|---|---|
| `static` | Resolved directly from the code: a direct call or import |
| `dispatch` | Through an interface, trait object or function value, where the target is one of a known set |
| `inferred` | Asserted by the producer (usually an agent) and not resolved from the code. Examples are framework routing, dependency injection and middleware chains. Renderers must distinguish inferred edges visually |

## 7. `flows`

A flow is a named path through the graph that tells the story of the change: "a request passes through the limiter", "start-up wiring".

| Field | Required | |
|---|---|---|
| `id` | yes | Unique id |
| `name` | yes | Short title |
| `description` | no | One or two sentences |
| `steps` | yes | Ordered ids of components or members |

Consecutive steps do not need to be joined by an edge. Flows describe what happens at runtime, which can pass through code that edges do not capture (callbacks, `next()`).

A good graph has one to three flows, and its main flow includes the most important added members.

## 8. `notes`

Notes are what the producer wants the reviewer to think about: risks, behaviour changes, and decisions worth questioning. They are where an agent adds the most value, so keep them specific and short.

| Field | Required | |
|---|---|---|
| `kind` | yes | `risk` (could cause a defect or incident), `behaviour` (observable behaviour changed, intentionally or not), or `note` |
| `text` | yes | One to three sentences |
| `refs` | yes | Ids the note is about |

## 9. `groups`

Optional. Groups cluster components, such as by directory or package: `{ "id": "src/limits", "label": "src/limits" }`. Renderers may draw them as regions or ignore them.

## 10. Conformance

A **conformant graph** validates against `graph.schema.json`, and:

1. Every id referenced by an edge, flow step or note exists.
2. Every added or changed function has `summary` and `klar`.
3. Every member that is not removed has `source`; every removed member has `base`.
4. Edges not resolved from the code are marked `dispatch` or `inferred`.

A **conformant renderer**:

1. Shows status for components, members and edges.
2. Distinguishes `inferred` edges from `static` ones.
3. Shows a member's Klar when it is selected, and shows raw code only on request.
4. Shows flows and notes.
