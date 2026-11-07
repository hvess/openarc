# Klar 0.2

*Draft. Status: open for comment. Replaces Klar 0.1.*

Klar is a language for describing what code does, in simpler terms than the code itself. A Klar description restates a function so that a reviewer can follow its logic, what it calls and what it changes, without knowing the language it was written in.

Klar is not executable. It's a controlled language, in the same spirit as Simplified Technical English (ASD-STE100): a small set of words, each with exactly one meaning, and one action per line.

```klar
  check(client, plan) → allowed | denied
    now = clock.now()
    bucket = bucketFor(client, plan, now)
    bucket.refill(now)
    taken = bucket.tryTake()
    If taken:
      Return allowed
    Return denied + retryAfter = bucket.secondsUntilNext(), rounded up

    changes buckets · depends on time
```

## 1. Goals

1. **Clear.** Each line has one meaning. There are no idioms ("pass on", "handle", "set up") and no conditions hidden inside sentences.
2. **Concise and technical, without jargon.** Steps are short verb phrases, and names come straight from the code. Klar never asks the reader to know a concept from a particular language or framework.
3. **Language-neutral.** TypeScript, Go, Python, Rust, Swift and Kotlin code all produce the same Klar for the same behaviour (§ 12).
4. **Shows what matters for review.** Calls into other code, changes to state, waiting, failing and the differences between versions are always visible.
5. **Diff-aware.** A Klar document can describe a change, marking what was added, changed and removed.

### Non-goals

- Klar doesn't round-trip. You can't generate code from it.
- Klar isn't complete. It leaves things out on purpose, and says so (§ 11).
- Klar doesn't carry types, source locations or summaries. Those live in the [OpenArc graph](graph.md) alongside it, which keeps the text short.

## 2. Documents

A Klar document is UTF-8 text with the extension `.klar`. It starts with a version line, may name the change it describes, and then lists components:

```klar
  klar 0.2
  change "Rate-limit authenticated requests per client"

+ class RateLimiter
    …
```

A line whose text starts with `#` is a comment.

## 3. The gutter

Every line starts with a two-character **gutter**: a change mark and a space.

| Mark | Meaning |
|---|---|
| `+` | Added by this change |
| `-` | Removed by this change |
| `~` | Changed by this change (declarations only) |
| ` ` | Unchanged, or inherits the mark of the declaration it's in |

- A mark on a component or member applies to all of it. Lines inside an added or removed declaration leave the gutter blank.
- `~` marks a declaration whose body changed. Inside it, each line is marked `+`, `-` or blank (unchanged).
- A line that changed in place is written as its old version (`-`) followed by its new version (`+`).
- A document that doesn't describe a change leaves every gutter blank.

## 4. Indentation and blocks

After the gutter, Klar is indented two spaces per level. Tabs aren't allowed.

| Level | Holds |
|---|---|
| 0 | Components |
| 2 | `needs`, `state`, `const` and member signatures |
| 4 and deeper | Steps |

Blocks follow three rules:

1. **A line that opens a block ends with a colon**: `If …:`, `Else:`, `For each …:`, `Wait for all:`.
2. **The block is everything indented under it, and ends where the indentation ends.** Nothing else ends a block.
3. **Conditions never appear inside a sentence.** "Create a bucket if the client is new" isn't Klar. Write `If bucket is missing:` and put the step underneath.

Renderers should draw a rail beside every block so the reader can see where it ends.

## 5. Components

A component is something a reviewer would draw as a box.

```
<kind> <Name>
```

| Kind | Use for |
|---|---|
| `class` | A type with behaviour: a class, a Rust `struct` with its `impl`, a Go struct with methods |
| `interface` | A contract: an interface, trait, protocol or abstract class |
| `module` | A file or namespace of free functions and constants |
| `record` | Data with no behaviour: a struct, data class or plain object type |
| `enum` | A closed set of cases |
| `external` | Something outside the codebase that the change talks to, such as a third-party API |

Inside a component, before its functions:

```klar
+ class RateLimiter
    needs clock
    state buckets = one TokenBucket per client, never removed
```

- `needs a, b`: what the component is given when it's created (constructor arguments, injected dependencies).
- `state name = description`: data the component holds and can change. State is always declared, because changes to it are among the things reviewers most need to see.
- `const NAME = value or description`: a fixed value. A constant whose value is a table may list it in an indented block underneath.

## 6. Signatures

A function starts with its signature:

```
[private] name(inputs) [→ result]
```

- **Inputs** are the parameter names from the code, without types. A default value may be shown: `buildServer(clock = systemClock)`.
- **The result** says what comes back, in a few words or as alternatives: `→ order`, `→ allowed | denied`, `→ 201 + order`. A function that returns nothing omits it.
- **A function value given as an input, or returned, is described where it's introduced**, so the reader never needs to know the pattern behind it:

  ```klar
    rateLimit(limiter) → request step(request, next = rest of the chain)
  ```

  Here `next` is defined as "the rest of the chain", so `Return next(request)` reads as "run the rest of the chain".

- A signature followed by `…` has its body left out, usually because it's unchanged context: `handle(request) → response …`.

## 7. Steps

A step is one line, and does one thing. It's one of:

- a **verb step**: one of the verbs in § 7.1, followed by what it acts on
- a **call** to another function in the graph (§ 7.2)
- a **control** line (§ 8)
- a **binding** of any of these to a name (§ 7.3)

### 7.1 Verbs

Klar has a fixed set of verbs. Each has one meaning, and no other verbs are allowed at the start of a step.

| Verb | Meaning | Example |
|---|---|---|
| `get` | Look up a value without changing anything | `bucket = get buckets[client]` |
| `create` | Make a new object or record | `create TokenBucket(capacity, rate, now)`, `create Contact from row` |
| `set` | Replace a value | `set order.status = shipped` |
| `add` | Put an item into a collection, or increase a number | `add row to rejected`, `add 1 to count` |
| `remove` | Take items out of a collection | `remove times older than 1 min from recent` |
| `compute` | Work out a value from others | `elapsed = compute now − updatedAt, in seconds` |
| `read` | Read from outside the program: a file, the network, the environment | `rows = read rows from file` |
| `write` | Write to outside the program | `write report to file` |
| `send` | Send a message, event or notification | `send ImportFinished(count, rejected)` |

`compute` may be left out when the expression is short and plain: `elapsed = now − updatedAt, in seconds`.

These words are banned at the start of a step because they hide what happens: *handle, process, manage, deal with, pass on, set up, wire, take care of, prepare, check*. Use a call, a verb from the table, or a control line instead.

### 7.2 Calls

When a step uses another function that appears in the graph, it's written as a call, with the names from the code:

```klar
      decision = limiter.check(user.id, user.plan)
      Wait for contacts.save(contact)
```

Calls are how Klar crosses from one box in the diagram to another, and renderers link them to the function they reach (§ 13). Prose is only for logic *inside* the function.

### 7.3 Naming results

A step whose result is used later binds it to a name with `=`:

```klar
      order = Wait for db.orders.insert(user.id, request.body)
```

`=` binds a name, sets a value (`set tokens = tokens − 1`), or names part of a result (`Return 429 + retry-after = decision.retryAfter`). It never compares.

### 7.4 Values and conditions

| Form | Examples |
|---|---|
| Numbers, with a unit where it helps | `429`, `20`, `1 s`, `5 min`, `100 ms` |
| Text | `"/orders"`, `"product:" + id` |
| Named outcomes and states | `allowed`, `denied`, `paid`, `yes`, `no` |
| Absence | `missing` (null, nil, None, undefined), `exists` (the opposite) |

Conditions use `is`, `has` and comparisons:

```klar
      If decision is denied:
      If request has no user:
      If cached exists:
      If tokens ≥ 1:
```

### 7.5 Operators

| Operator | Meaning | ASCII form |
|---|---|---|
| `→` | gives back | `->` |
| `\|` | or (between alternatives) | |
| `+` | plus, or "together with" (`201 + order`) | |
| `−` `×` `÷` | minus, times, divided by | `-` `*` `/` |
| `<` `≤` `>` `≥` `≠` | comparisons | `<=` `>=` `!=` |
| `=` | binds or sets | |
| `·` | separates effects in the footer | `,` |

## 8. Control

Control words are capitalised so they stand out even without highlighting.

| Form | Meaning |
|---|---|
| `If <condition>:` | Run the block when the condition holds |
| `Else if <condition>:` | Otherwise, run this block when its condition holds |
| `Else:` | Otherwise, run this block |
| `Depending on <value>:` with `When <case>[, <case>]:` | Run the block for the matching case |
| `For each <item> in <collection>:` | Run the block once per item |
| `While <condition>:` | Run the block as long as the condition holds |
| `Repeat up to <n> times:` | Run the block at most `n` times |
| `Skip` | Go to the next item of the loop it's in |
| `Stop` | Leave the loop it's in |
| `Wait for <call or duration>` | Pause until the call finishes or the time passes |
| `Wait for all:` | Start every call in the block at the same time, and continue once they've all finished. If any of them fails, the block fails |
| `Return <value>` | End the function with this result |
| `Fail <Error>[(details)]` | End the function with this error |

`Return` and `Fail` always end the whole function. Once a branch ends in `Return` or `Fail`, an `Else` after it isn't needed:

```klar
      If request has no user:
        Return next(request)
      decision = limiter.check(user.id, user.plan)
```

## 9. Effects

A function ends with a blank line and an **effects footer**: what it does besides producing its result. For a reviewer it's often the most important part.

```klar
      changes buckets · depends on time
```

| Effect | Meaning |
|---|---|
| `changes <state>` | Changes state the program holds: a component's `state`, an object it was given |
| `reads <thing>` | Reads from outside the program: a database, cache, file or service |
| `writes <thing>` | Writes to outside the program |
| `sends <message>` | Sends a message, event, email or notification |
| `fails <Error>` | Can end with this error |
| `depends on time` / `depends on randomness` | Gives different results at different times, or on different runs |
| `no effects` | None of the above |

Effects describe the function's own steps, not the functions it calls; the reader follows the calls to see those.

In a changed function, footer lines carry change marks like any other line:

```klar
-     changes recentOrders · depends on time
      writes db
```

## 10. Context

Unchanged functions that the change connects to can be listed with their signature and `…`, so the document reads as a whole:

```klar
  class Router
    use(step) …
    handle(request) → response …
```

## 11. Leaving things out

Klar leaves things out on purpose: logging, metrics, tracing, input parsing, type conversions, and passing errors up to the caller. A function can say what it left out with an `omits` line in its footer:

```klar
      writes db · fails NotFound
      omits logging, retries
```

An `…` on its own line marks a left-out stretch of steps, optionally with a comment:

```klar
      …                       # parse and normalise headers
```

Anything that changes what a caller can observe must not be left out. If a check decides whether a request succeeds, it's a step.

## 12. Language neutrality

Klar describes what happens, not how a language makes it happen. Each mechanism below maps to a single Klar form:

| What the code does | TypeScript / JS | Go | Python | Rust / Swift | Klar |
|---|---|---|---|---|---|
| Wait for a result | `await`, promises | blocking call, channel receive | `await` | `.await`, `async let` | `Wait for` |
| Do things at the same time | `Promise.all` | goroutines and `WaitGroup` | `asyncio.gather` | `join!`, task groups | `Wait for all:` |
| Fail | `throw` | `return err` | `raise` | `Err(…)`, `throw` | `Fail` |
| No value | `null`, `undefined` | `nil` | `None` | `None`, `nil` | `missing` |
| Pass an error up | `try` / `catch` and rethrow | `if err != nil { return err }` | `try` / `except` and re-raise | `?`, `try` | left out (§ 11) |
| Function as a value | callbacks, closures | function values | lambdas | closures | described in the signature (§ 6) |

Words that belong to a framework or pattern, such as *middleware*, *handler*, *hook*, *reducer* or *controller*, may appear only as names taken from the code. Klar never relies on the reader knowing what they mean.

## 13. Highlighting

Renderers and editors colour Klar with these token classes:

| Class | Covers |
|---|---|
| control | `If`, `Else`, `Else if`, `Depending on`, `When`, `For each`, `While`, `Repeat up to`, `Skip`, `Stop`, `Wait for`, `Wait for all`, `Return`, `Fail` |
| declaration | `class`, `module`, `interface`, `record`, `enum`, `external`, `needs`, `state`, `const`, `private`, `klar`, `change` |
| name | names from the code: components, members, inputs and bound names |
| call | a call that the graph connects to a function (§ 7.2) |
| verb | the verbs of § 7.1 at the start of a step |
| value | numbers, text, named outcomes |
| operator | § 7.5 |
| effect | the effect words of § 9 and § 11 |
| change | the gutter marks of § 3 |

Names are highlighted only when something defines them: the graph, a signature, `needs`, `state`, or a binding. Renderers shouldn't guess from capitalisation alone. A renderer with the graph should make calls into links to the function they reach.

## 14. Conformance

A **conformant Klar 0.2 document**:

1. Starts with `klar 0.2`.
2. Gives every line a two-character gutter and uses two-space indentation.
3. Ends every line that opens a block with a colon, and puts no conditions inside sentences.
4. Starts every step with a verb from § 7.1, a call, a control word, or a binding (`name = …`).
5. Gives every added or changed function an effects footer.

A **conformant producer** (a person, tool or agent writing Klar) also:

6. Keeps the code's names.
7. Writes a call, not prose, whenever a step uses another function in the graph.
8. Leaves out nothing that changes what a caller can observe (§ 11).
9. Keeps functions short. About 10 steps is the guideline; a longer function is described in larger steps, not line by line.

## 15. Grammar

Informal and line-based. `INDENT(n)` is `n` spaces after the gutter.

```ebnf
document    = version , [ change ] , { comment | blank | component } ;
version     = gutter , "klar 0.2" , NL ;
change      = gutter , "change" , SP , text , NL ;

component   = gutter , INDENT(0) , kind , SP , Name , NL ,
              { needs | state | const | function } ;
kind        = "class" | "interface" | "module" | "record" | "enum" | "external" ;
needs       = gutter , INDENT(2) , "needs" , SP , names , NL ;
state       = gutter , INDENT(2) , "state" , SP , name , " = " , phrase , NL ;
const       = gutter , INDENT(2) , "const" , SP , NAME , [ " = " , phrase ] , NL , { detail } ;

function    = gutter , INDENT(2) , signature , ( SP , "…" , NL | NL , body ) ;
signature   = [ "private" , SP ] , name , "(" , [ inputs ] , ")" , [ SP , "→" , SP , result ] ;
body        = { step-line } , [ blank , footer ] ;
step-line   = gutter , INDENT(4 + 2k) , ( step | opener ) , [ comment ] , NL ;
opener      = control-head , ":" ;            (* opens a block *)
step        = [ name , " = " ] , ( verb-step | call | wait | expression )
            | "Return" , [ SP , phrase ] | "Fail" , SP , Name , [ "(" , args , ")" ]
            | "Skip" | "Stop" | "…" ;
footer      = { gutter , INDENT(4) , effect , { " · " , effect } , NL } ;
gutter      = ( "+" | "-" | "~" | " " ) , " " ;
comment     = "#" , text ;
```

## 16. Open questions

- **Mapping detail in `create … from …`.** `create Contact from row` hides how fields map. That's usually fine for review, but when the mapping *is* the change it should be written out as `set` lines. Should Klar require that, or leave it to the producer?
- **Locks and channels.** Are `Wait for` and `Wait for all:` enough for code built on locks, channels or actors, or does Klar need words for them?
- **Linting.** The verb list, banned words and block rules can all be checked mechanically. Should a linter ship with the spec?
- **Very small functions.** Should a function whose whole body is one call be allowed on a single line: `secondsUntilNext() → (1 − tokens) ÷ refillPerSecond`?
