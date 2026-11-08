// The OpenArc Graph 0.1 format (spec/graph.md, spec/graph.schema.json) as types, shared by the
// build and the viewer. The schema is what a graph is checked against; these follow it.

export type Status = "added" | "changed" | "removed" | "context";
export type ComponentKind = "class" | "interface" | "module" | "record" | "enum" | "external" | "file";
export type MemberKind = "function" | "const" | "state" | "type" | "section";
export type EdgeKind = "calls" | "creates" | "reads" | "writes" | "implements" | "extends" | "uses";
export type Resolution = "static" | "dispatch" | "inferred";
export type NoteKind = "risk" | "behaviour" | "note";

// A range of lines in a source file, and once built, the code in it.
export interface Anchor {
  file?: string;
  lines: [number, number];
  code?: string;
}

export interface Member {
  id: string;
  name: string;
  kind: MemberKind;
  status: Status;
  signature?: string;
  visibility?: "public" | "private";
  summary?: string;
  klar?: string;
  effects?: string[];
  baseEffects?: string[];
  source?: Anchor;
  base?: Anchor;
}

export interface Component {
  id: string;
  name: string;
  kind: ComponentKind;
  status: Status;
  file?: string;
  group?: string;
  summary?: string;
  klar?: string;
  members: Member[];
}

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  status: Status;
  resolution?: Resolution;
  label?: string;
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  steps: string[];
}

export interface Note {
  kind: NoteKind;
  text: string;
  refs: string[];
}

export interface Change {
  title: string;
  summary: string;
  base?: string;
  head?: string;
  // Only in graph.src.json: the Klar document to read. The build removes it.
  klar?: string;
}

export interface Graph {
  openarc: "0.1";
  change: Change;
  groups?: { id: string; label?: string }[];
  components: Component[];
  edges: Edge[];
  flows?: Flow[];
  notes?: Note[];
}
