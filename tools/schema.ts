// A small JSON Schema checker for the parts of draft 2020-12 that OpenArc's own schemas use:
// type, enum, const, required, properties, additionalProperties: false, items, prefixItems,
// minItems, maxItems, minLength, minimum, $ref into #/$defs, allOf and if/then/else.
// It returns a list of problems, each prefixed with where in the value it was found.

export interface Schema {
  $ref?: string;
  const?: unknown;
  enum?: unknown[];
  type?: string;
  default?: unknown;
  minLength?: number;
  minimum?: number;
  minItems?: number;
  maxItems?: number;
  items?: Schema;
  prefixItems?: Schema[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  allOf?: Schema[];
  if?: Schema;
  then?: Schema;
  else?: Schema;
  [key: string]: unknown;
}

type JsonObject = Record<string, unknown>;

export function validate(value: unknown, schema: Schema, root: Schema = schema, at = "$"): string[] {
  if (schema.$ref) return validate(value, ref(root, schema.$ref), root, at);
  const out: string[] = [];
  const fail = (msg: string) => out.push(`${at}: ${msg}`);

  if ("const" in schema && value !== schema.const) fail(`must be ${JSON.stringify(schema.const)}; got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}; got ${JSON.stringify(value)}`);
  if (schema.type && !isType(value, schema.type)) { fail(`must be ${schema.type}; got ${JSON.stringify(value)}`); return out; }

  if (typeof value === "string" && value.length < (schema.minLength ?? 0)) fail(`must have at least ${schema.minLength} character(s)`);
  if (typeof value === "number" && value < (schema.minimum ?? -Infinity)) fail(`must be at least ${schema.minimum}`);

  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) fail(`must have at least ${schema.minItems} item(s)`);
    if (value.length > (schema.maxItems ?? Infinity)) fail(`must have at most ${schema.maxItems} item(s)`);
    const prefix = schema.prefixItems ?? [];
    value.forEach((v, i) => {
      const s = i < prefix.length ? prefix[i] : schema.items;
      if (s) out.push(...validate(v, s, root, `${at}[${i}]`));
    });
  }

  if (isObject(value)) {
    const props = schema.properties ?? {};
    for (const k of schema.required ?? []) if (!(k in value)) fail(`missing "${k}"`);
    for (const [k, s] of Object.entries(props)) if (k in value) out.push(...validate(value[k], s, root, `${at}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in props)) fail(`unknown property "${k}"`);
  }

  for (const s of schema.allOf ?? []) out.push(...validate(value, s, root, at));
  if (schema.if) {
    const branch = validate(value, schema.if, root, at).length ? schema.else : schema.then;
    if (branch) out.push(...validate(value, branch, root, at));
  }
  return out;
}

function ref(root: Schema, pointer: string): Schema {
  if (!pointer.startsWith("#/")) throw new Error(`unsupported $ref ${pointer}`);
  const target = pointer.slice(2).split("/").reduce<unknown>((node, key) => (isObject(node) ? node[key] : undefined), root);
  if (!isObject(target)) throw new Error(`unresolved $ref ${pointer}`);
  return target as Schema;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isType(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number";
    default: return typeof value === type;
  }
}
