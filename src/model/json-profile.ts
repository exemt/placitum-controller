export type JsonSchemaKind = "openapi" | "jsonschema";
export type JsonAction = "deny" | "score" | "allow";
export type JsonMatch = "exact" | "prefix";
export type JsonAuditValues = "off" | "hash";

export interface JsonSchemaRef {
  kind: JsonSchemaKind;
  source: string;
  basePath: string;
}

export interface JsonRequestChecks {
  body: boolean;
  query: boolean;
  pathParams: boolean;
  headers: boolean;
}

export interface JsonResponseChecks {
  body: boolean;
  status: boolean;
  contentType: boolean;
}

export interface JsonRule {
  action: JsonAction;
  score: number;
}

export const JSON_REQUEST_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "content_type",
  "unavailable",
] as const;

export const JSON_RESPONSE_OUTCOMES = [
  ...JSON_REQUEST_OUTCOMES,
  "status",
] as const;

export type JsonRequestOutcome = (typeof JSON_REQUEST_OUTCOMES)[number];
export type JsonResponseOutcome = (typeof JSON_RESPONSE_OUTCOMES)[number];

export type JsonRequestPolicy = Record<JsonRequestOutcome, JsonRule>;
export type JsonResponsePolicy = Record<JsonResponseOutcome, JsonRule>;

export interface JsonRequestPhase {
  enabled: boolean;
  checks: JsonRequestChecks;
  policy: JsonRequestPolicy;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonResponsePhase {
  enabled: boolean;
  checks: JsonResponseChecks;
  policy: JsonResponsePolicy;
  onlyTypes: string[];
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonBinding {
  methods: string[];
  path: string;
  match: JsonMatch;
  schema: string;
}

export type JsonDirection = "c2s" | "s2c" | "any";

export interface JsonDiscriminator {
  pointer: string;
  value: string;
}

export interface JsonFrameBinding {
  path: string;
  match: JsonMatch;
  direction: JsonDirection;
  subprotocol: string;
  discriminator: JsonDiscriminator | null;
  schema: string;
}

export const JSON_FRAME_OUTCOMES = [
  "invalid",
  "unparsable",
  "truncated",
  "unknown_operation",
  "opcode",
  "unavailable",
] as const;

export type JsonFrameOutcome = (typeof JSON_FRAME_OUTCOMES)[number];
export type JsonFramePolicy = Record<JsonFrameOutcome, JsonRule>;

export interface JsonFrameChecks {
  body: boolean;
}

export interface JsonFrameDirection {
  checks: JsonFrameChecks;
  policy: JsonFramePolicy;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonFramePhase {
  enabled: boolean;
  bindings: JsonFrameBinding[];
  c2s: JsonFrameDirection;
  s2c: JsonFrameDirection;
}

export interface JsonLimits {
  maxBody: number;
  maxDepth: number;
  maxErrors: number;
  cache: number;
}

export interface JsonAudit {
  values: JsonAuditValues;
  paths: boolean;
}

export type JsonVerb = "threshold" | "skip";

export interface JsonPriorRule {
  from: string;
  accept: JsonVerb[];
  codes: string[];
}

export interface JsonTrigger {
  prior: JsonPriorRule[];
}

export type JsonOn = "deny" | "allow" | "score" | "overload";

import type { ArchiveWhen, RecordObject } from "./actions.ts";

export type JsonWrite = "addr" | "net" | "net_all" | "asn";

export interface JsonOutcome {
  on: JsonOn;
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
  write: JsonWrite;
  ttlS: number;

  code: string;
}

export interface JsonProfileDoc {
  trigger: JsonTrigger;
  description: string;
  schema: JsonSchemaRef;
  request: JsonRequestPhase;
  response: JsonResponsePhase;
  frame: JsonFramePhase;
  bindings: JsonBinding[];
  limits: JsonLimits;
  audit: JsonAudit;
}

export interface JsonProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  kind: JsonSchemaKind;
  source: string;
  doc: JsonProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
