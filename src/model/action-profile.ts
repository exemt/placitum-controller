import type { ArchiveWhen, RecordObject } from "./actions.ts";
import type { ActionCondOp } from "./action-cond.ts";

export type ActionWrite = "addr" | "net" | "net_all" | "asn";

export interface ActionAsk {
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  counter: string;
  marker: string;
  group: string;
  phase?: string;
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  when: ArchiveWhen[];
  ttlS: number;
  list: string;
  write: ActionWrite;
  code: string;
}

export interface ActionMatch {
  pathPrefix: string;
  suffixes: string[];
  static: boolean;
  methods: string[];
}

export interface ActionCondition {
  name: string;
  value: string;
  op: ActionCondOp;
  dataset: string;
  text: string;
}

export interface ActionWhenItem {
  cond: string;
  not: boolean;
}

export type ActionWhenGroup = ActionWhenItem[];

export interface ActionRule {
  name: string;
  on?: "" | "overload";
  at?: number | null;
  match: ActionMatch;
  when: ActionWhenGroup[];
  actions: ActionAsk[];
}

export interface ActionProfileDoc {
  description: string;
  conditions: ActionCondition[];
  rules: ActionRule[];
}

export interface ActionProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
