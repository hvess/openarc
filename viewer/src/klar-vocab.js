// The fixed vocabulary of Klar 0.2 (spec/klar.md). The viewer highlights with it and
// tools/klar.mjs reads documents with it; tests/klar.test.mjs checks it against the spec.

// § 13. Longer phrases come first so "Wait for all" wins over "Wait for".
export const CONTROL = ["Wait for all", "Wait for", "For each", "Repeat up to", "Depending on", "Else if", "If", "Else", "When", "While", "Return", "Fail", "Skip", "Stop"];
export const DECLARATIONS = ["class", "module", "interface", "record", "enum", "external", "file", "needs", "state", "const", "section", "private", "klar", "change"];
// § 5.
export const COMPONENT_KINDS = ["class", "module", "interface", "record", "enum", "external", "file"];
// § 7.1.
export const VERBS = ["get", "create", "set", "add", "remove", "compute", "read", "write", "send"];
// § 9 and § 11.
export const EFFECTS = ["no effects", "changes", "reads", "writes", "sends", "fails", "depends on", "omits"];

// A component declaration at level 0: `class RateLimiter`, or `file "package.json"` for a file
// that isn't code, named by its quoted path. The name is group 2 or, quoted, group 3.
export const COMPONENT_LINE = new RegExp(`^(${COMPONENT_KINDS.join("|")})\\s+(?:([\\w.]+)|"([^"]+)")`);
// A member at level 2: `check(…)`, `private bucketFor(…)`, `state buckets = …`, `const LIMIT = …`.
// `section "Install on Linux"` names a part of a prose file by its heading, quoted. The name is
// group 2 or, quoted, group 3.
export const MEMBER_LINE = /^(?:private\s+)?(?:(const|state|section)\s+)?(?:([A-Za-z_][\w.]*)|"([^"]+)")/;
