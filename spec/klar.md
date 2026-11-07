# Klar 0.1

*Draft. Status: open for comment.*

Klar is a language for describing what code does, in simpler terms than the code itself. A Klar document restates a code change so that a reviewer can follow its intent, structure and side effects without reading the source language.

Klar is not executable. It is not a programming language and has no runtime. It is closer to the pseudocode in a well-written design doc, but with enough fixed structure that tools can read it, check it and draw it.

```klar
+ class RateLimiter @ src/limits/rate-limiter.ts
    "Gives each client a token bucket sized by their plan."
    needs clock: Clock
    state buckets: Map<ClientId, TokenBucket> @ :9

    fn check(clientId: Text, plan: Plan) -> Decision @ :13-19
      "Spend one token for this client, or say how many seconds until one is available."
      let now = clock.now()
      let bucket = bucketFor(clientId, plan, now)
      bucket.refill(now)
      if bucket.tryTake()
        return allowed
      return denied, retryAfter = ceil(bucket.secondsUntilNext())
      effects: time, mutates buckets
```

## 1. Goals

1. **Readable by anyone who reads code.** A reviewer who does not know the source language should understand a Klar block on the first read.
2. **One language for every source language.** TypeScript, Rust, Go, Python and Swift all map to the same small set of constructs.
3. **Shows what matters for review.** Mutation, I/O, time, failure and changes between versions are always visible. Boilerplate is not.
4. **Traceable.** Every declaration points back to the source lines it describes, so a reader can check the Klar against the code.
5. **Diff-aware.** A Klar document can describe a *change*, marking what was added, changed and removed.

### Non-goals

- Klar does not round-trip. You cannot generate code from it.
- Klar does not try to be complete. Leaving things out is the point; § 8 says how to do it honestly.
- Klar does not try to be precise about types. Types are there to help the reader, not to be checked.

## 2. Documents

A Klar document is UTF-8 text, conventionally with the extension `.klar`. It begins with a version line and may name the change it describes:

```klar
  klar 0.1
  change "Rate-limit authenticated requests per client"
```

The rest of the document is a sequence of **components**, each containing **members**. Lines starting with `#` (after the gutter) are comments.

## 3. The gutter

Every line starts with a two-character **gutter**: a status mark followed by a space.

| Mark | Meaning |
|---|---|
| `+` | Added by this change |
| `-` | Removed by this change |
| `~` | Changed by this change (only on declarations; see below) |
| ` ` | Unchanged, or inherits the status of the enclosing declaration |

Rules:

- A mark on a **declaration** (component or member) applies to the whole declaration. Lines inside an added or removed declaration leave their gutter blank; they inherit it.
- `~` marks a declaration whose body changed. Inside it, individual lines carry `+` or `-`, and unmarked lines are unchanged.
- A line that changed in place is written as a `-` line followed by a `+` line.
- A document that does not describe a change uses a blank gutter everywhere.

```klar
~   fn createOrder(req: Request) -> Response @ :9-12
      "Store a new order for the signed-in user."
-     if they placed MAX_ORDERS_PER_MINUTE or more in the last minute
-       return 429
      let order = db.orders.insert(req.user.id, req.body)
      return 201 with order
-     effects: time, mutates recentOrders, io db
+     effects: io db
```

## 4. Indentation

After the gutter, indentation is two spaces per level and is significant:

| Level | Holds |
|---|---|
| 0 | Component declarations |
| 2 | Component description, `needs`, `state`, and member declarations |
| 4+ | Member bodies |

Tabs are not allowed.

## 5. Components

A component is a unit of code that a reviewer would draw as a box: a class, a module of functions, an interface.

```
<kind> <Name> [@ <path>]
```

| Kind | Use for |
|---|---|
| `class` | A type with behaviour: a class, a Rust `struct` plus its `impl`, a Go struct with methods |
| `interface` | A contract: an interface, trait, protocol or abstract class |
| `module` | A file or namespace of free functions and constants |
| `record` | Data with no behaviour: a struct, data class or plain object type |
| `enum` | A closed set of variants |
| `external` | Something outside the codebase that the change talks to, such as a third-party API or a database |

Inside a component, before its members:

- An optional **description**: a single double-quoted line saying what the component is for.
- `needs a: T, b: U`: what the component is given when it is created (constructor parameters, injected dependencies).
- `state name: T`: data the component holds and may change. State is declared because mutation is one of the things reviewers most need to see.

## 6. Members

```
[private] fn <name>(<params>) [-> <Type>] [@ <anchor>]
const <NAME>[: <Type>] [= <value>] [@ <anchor>]
state <name>: <Type> [@ <anchor>]
type <Name> = <Type> [@ <anchor>]
```

A member declaration ending in `…` has its body intentionally omitted, usually because it is unchanged context:

```klar
    fn handle(req: Request) -> Response @ :30-35 …
```

A function body is made of:

1. An optional **description** on the first line, double-quoted. Required for added and changed functions.
2. **Steps** (§ 7).
3. An optional `effects:` clause (§ 9). Required for added and changed functions.
4. An optional `elides:` clause (§ 8).

## 7. Steps

A step is one line. It is either a **keyword step** or a **prose step**.

### Keyword steps

| Form | Meaning |
|---|---|
| `let x = <expr>` | Introduce a name |
| `set <target> = <expr>` | Change something that already exists. Every mutation uses `set`, so mutation is easy to scan for |
| `if <cond>` / `else if <cond>` / `else` | Branch; the body is indented |
| `for each x in <expr>` | Loop over a collection |
| `while <cond>` | Loop on a condition |
| `match <expr>` with `case <pattern>` | Branch on the shape of a value |
| `return <expr>` | Produce the result |
| `fail <Error> ["reason"]` | Stop with an error (throw, panic, `Err(...)`) |
| `wait for <expr>` | Suspend until something completes (`await`, blocking I/O, joins) |
| `emit <event>` | Send an event, message or notification |
| `spawn <expr>` | Start concurrent work without waiting for it |
| `fn (<params>):` | A function value, such as a closure or callback; the body is indented |

### Prose steps

Any line that does not start with a keyword is a prose step: a short imperative sentence describing one action.

```klar
      refill bucket by the time elapsed since its last refill
      drop this user's order times older than one minute
```

Prose steps are the reason Klar is readable. They are also where it can become vague. Producers should follow these rules:

- One action per line.
- Use the names that appear in the code. If the code says `bucket`, the prose says `bucket`.
- Prefer a keyword step whenever one fits. Use prose for logic that would take several keyword steps without being clearer.

### Expressions

Expressions borrow familiar notation: calls `a.b(c)`, member access `a.b`, indexing `a[b]`, arithmetic, comparison (`<`, `≥` or `>=`), and boolean `and`, `or` and `not`. Constructing an object is written `new T(args)`. Expressions may also be short phrases (`return 429 with retry-after`) when that reads more clearly than a literal translation.

### References

Inside a body, a name qualified as `Component.member` refers to a member of another component in the document or graph. A bare name refers to something in the current component or local scope. Tools may cross-check references against the graph's edges.

## 8. Elision

Klar leaves things out on purpose. To be honest about it, a function may list what kinds of code it left out:

```klar
      elides: logging, metrics, input validation
```

Standard categories: `logging`, `metrics`, `tracing`, `input validation`, `null checks`, `error propagation`, `type conversion`, `retries`, `resource cleanup`. Producers must not leave out anything that changes behaviour a caller can observe. If a null check decides whether a request succeeds, it is a step, not an elision.

An `…` on its own line marks an elided span inside a body:

```klar
      …                                   # parse and normalise headers
```

## 9. Effects

`effects:` lists what a function does besides computing its return value. This is the most important line for a reviewer.

| Effect | Meaning |
|---|---|
| `none` | Pure: same inputs give the same result and nothing else happens |
| `mutates <target>` | Changes in-memory state (`self`, a field, an argument) |
| `reads <target>` / `writes <target>` | Reads or writes persistent or shared state outside the process's own memory |
| `io <channel>` | Talks to the outside world: `db`, `net`, `disk`, `process`, `ipc` |
| `time` | Depends on the current time |
| `random` | Depends on randomness |
| `fails <Error>` | Can fail with this error |
| `waits` | Suspends (async or blocking) |
| `spawns` | Starts concurrent work |
| `emits <event>` | Sends events or messages |

Effects describe the function's own body, not its callees. A reader follows the edges to see those.

## 10. Source anchors

`@` ties a declaration to source:

- On a component: `@ <path>`, the file path relative to the repository root.
- On a member: `@ :<start>-<end>` or `@ :<line>` for lines in the component's file, or `@ <path>:<start>-<end>` for a different file.

Line numbers refer to the **head** (after) version of the file, except for removed (`-`) declarations, which refer to the **base** (before) version.

## 11. Types

Types are written in a small common vocabulary so that reviewers do not need to know the source language's:

`Bool`, `Int`, `Num`, `Text`, `Bytes`, `Time`, `Duration`, `Any`, `List<T>`, `Set<T>`, `Map<K, V>`, `Maybe<T>`, `Result<T, E>`, records `{ a: T, b: U }`, and unions `A | B`.

Domain types keep the names they have in the code (`Plan`, `TokenBucket`). Types may be omitted wherever they would not help the reader.

## 12. Conformance

A **conformant Klar 0.1 document**:

1. Starts with `klar 0.1`.
2. Uses a two-character gutter on every line and two-space indentation.
3. Gives every added or changed function a description and an `effects:` clause.
4. Uses `set` for every mutation that the source performs.
5. Gives every component a path anchor, and every added, changed or removed member a line anchor.

A **conformant producer** (a person, tool or agent that writes Klar) also:

6. Keeps the code's names.
7. Leaves out nothing that changes behaviour a caller can observe (§ 8).
8. Keeps function bodies short. About 12 steps is the guideline; a longer function is described in larger steps, not line by line.

## 13. Grammar

Informal, line-oriented. `INDENT(n)` is `n` spaces after the gutter.

```ebnf
document   = version-line , { change-line | comment | blank | component } ;
version-line = gutter , "klar" , SP , version ;
change-line  = gutter , "change" , SP , string ;

component  = gutter , INDENT(0) , kind , SP , name , [ anchor ] , NL ,
             { comp-line } ;
kind       = "class" | "interface" | "module" | "record" | "enum" | "external" ;
comp-line  = gutter , INDENT(2) , ( string | needs | member ) ;
needs      = "needs" , SP , params ;

member     = [ "private" , SP ] , ( fn-decl | const-decl | state-decl | type-decl ) ,
             [ anchor ] , [ SP , "…" ] , NL , { body-line } ;
fn-decl    = "fn" , SP , name , "(" , [ params ] , ")" , [ SP , "->" , SP , type ] ;
const-decl = "const" , SP , name , [ ":" , SP , type ] , [ SP , "=" , SP , text ] ;
state-decl = "state" , SP , name , ":" , SP , type , { "," , SP , name , ":" , SP , type } ;
type-decl  = "type" , SP , name , SP , "=" , SP , type ;

body-line  = gutter , INDENT(4 + 2k) , ( string | step | effects | elides | "…" ) , [ comment ] , NL ;
effects    = "effects:" , SP , ( "none" | effect , { "," , SP , effect } ) ;
elides     = "elides:" , SP , text ;
anchor     = SP , "@" , SP , ( path | ":" , range | path , ":" , range ) ;
gutter     = ( "+" | "-" | "~" | " " ) , " " ;
comment    = "#" , text ;
```

## 14. Open questions

- **Changed lines inside an unchanged block.** Is `-` then `+` enough, or should Klar have a compact "was" form, such as `set tokens = x   # was: y`?
- **Generics and overloads.** Should Klar show overloads as separate members, or as one member with alternatives?
- **Concurrency.** Are `spawn` and `waits` enough to describe channels, actors and locks, or does Klar need a `lock` step?
- **Prose quality.** Can a linter usefully flag vague prose steps ("handle the data")?
