import type { ArchiveWhen, RecordObject } from "./actions.ts";

export type AuthVerb = "reauth" | "skip";
export type AuthAxis = "request" | "session";

export interface AuthPriorRule {
  from: string;
  accept: AuthVerb[];
  apply: AuthAxis[];
  codes: string[];
}

export interface AuthTrigger {
  prior: AuthPriorRule[];
  reauthAfterS: number;
}

export interface AuthGate {
  redirectMethods: string[];
  redirectStatus: number;
  denyResponse: string;
  htmlOnly: boolean;
  groups: string[];
  forbiddenResponse: string;
  inline: boolean;
}

export const AUTH_ONS = ["authenticated", "anonymous", "invalid", "forbidden", "overload"] as const;

export type AuthOn = (typeof AUTH_ONS)[number];

export interface AuthEventRule {
  on: AuthOn;
  at?: number | null;

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

export interface AuthProfileDoc {
  source: string;
  gate: AuthGate;
  trigger: AuthTrigger;
  rules: AuthEventRule[];
}

export interface AuthProfileMeta {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthProfile extends AuthProfileMeta {
  doc: AuthProfileDoc;
}
