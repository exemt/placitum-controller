export type CounterJudgeAction = "deny" | "score";

export type CounterSource = "const" | "regex_count" | "size_kb" | "bytes";

export const COUNTER_AXES = ["ip", "asn_net", "asn_router", "sess", "user", "conn"] as const;

export const COUNTER_DIRECTIONS = ["c2s", "s2c"] as const;
export const COUNTER_OPCODES = ["text", "binary", "continuation"] as const;

export type CounterAxis = (typeof COUNTER_AXES)[number];

export interface CounterAxisTier {
  max: number;
  loss: number;
}

export type CounterFill = "measure" | "note";

export interface CounterDeclSubjects {
  sess: { cookie: string };
  user: { from: string };
}

export interface CounterDecl {
  unit: string;
  fill: CounterFill;
  axes: Partial<Record<CounterAxis, CounterAxisTier>>;
  subjects: CounterDeclSubjects | null;
}

export interface CounterSubjects {
  sess: { cookie: string };
  user: { from: string };
}

export interface CounterSharedDoc {
  counters: Record<string, CounterDecl>;
  subjects: CounterSubjects;
}

export const DEFAULT_SESS_COOKIE = "waf_cid";

export interface CounterJudgeRule {
  counter: string;
  axis: CounterAxis;
  at: number;
  action: CounterJudgeAction;
  score: number;
  code: string;
}

export interface CounterMeasureIf {
  status: number[];
  contentType: string[];
  methods: string[];
  direction: string[];
  opcode: string[];
}

export interface CounterMeasureRule {
  if: CounterMeasureIf;
  source: CounterSource;
  regex: string;
  per: number | null;
  counter: string;
  axes: CounterAxis[];
}

export type CounterVerb = "threshold" | "skip" | "note";

export interface CounterPriorRule {
  from: string;
  accept: CounterVerb[];
  apply: string[];
  codes: string[];
  counter: string;
}

export interface CounterTrigger {
  prior: CounterPriorRule[];
}

export type CounterOn = "deny" | "allow" | "score" | "level" | "overload";

export interface CounterOutcomeIf {
  counter: string;
  axis: CounterAxis;
}

import type { ArchiveWhen, RecordObject } from "./actions.ts";

export interface CounterOutcome {
  on: CounterOn;
  at: number | null;
  below: boolean;
  if: CounterOutcomeIf | null;
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
  write: string;
  ttlS: number;

  code: string;
}

export interface CounterRequestPhase {
  enabled: boolean;
  judge: CounterJudgeRule[];
  denyResponse: string;
  outcomes: CounterOutcome[];
}

export interface CounterResponsePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
}

export interface CounterFramePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
  judge: CounterJudgeRule[];
  denyResponse: string;
  outcomes: CounterOutcome[];
}

export interface CounterProfileDoc {
  description: string;
  trigger: CounterTrigger;
  request: CounterRequestPhase;
  response: CounterResponsePhase;
  frame: CounterFramePhase;
}

export interface CounterProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
