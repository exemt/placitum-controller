export type VlaiOverload = "wait" | "shed";

export interface VlaiPriorRule {
  from: string;
  accept: ("threshold" | "skip")[];
  codes: string[];
}

import type { ArchiveWhen, RecordObject } from "./actions.ts";

export interface VlaiOutcome {
  on: "score" | "overload";
  at: number | null;
  below: boolean;
  eq: boolean;
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
  list: string;
  write: "addr" | "net" | "net_all" | "asn";
  ttlS: number;
  code: string;
}

export interface VlaiProfileDoc {
  description: string;
  overload: VlaiOverload;
  trigger: { prior: VlaiPriorRule[] };
  outcomes: VlaiOutcome[];
}

export interface VlaiProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: VlaiProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
