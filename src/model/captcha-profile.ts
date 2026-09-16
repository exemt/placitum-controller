import type { ArchiveWhen, RecordObject } from "./actions.ts";

export type CaptchaWhen = "always" | "buckets" | "never";
export type CaptchaMatch = "exact" | "prefix";
export type CaptchaProviderKind =
  | "image"
  | "turnstile"
  | "recaptcha"
  | "hcaptcha"
  | "smartcaptcha";
export type CaptchaOnError = "fallback" | "allow" | "deny";

export type CaptchaVerb = "challenge" | "skip" | "note";
export type CaptchaAccept = CaptchaVerb | "*";

export interface CaptchaPriorRule {
  from: string;
  accept: CaptchaAccept[];
  codes: string[];
}

export interface CaptchaTrigger {
  when: CaptchaWhen;
  prior: CaptchaPriorRule[];
}

export interface CaptchaBucketTier {
  max: number;
  loss: number;
  captchaAt: number;
  banAt: number;
}

export interface CaptchaBuckets {
  ip: CaptchaBucketTier;
  sess: CaptchaBucketTier;
  asnNet: CaptchaBucketTier;
  asnRouter: CaptchaBucketTier;
}

export type CaptchaOn =
  | "fail"
  | "pass"
  | "bucket_captcha"
  | "bucket_ban"
  | "cleared"
  | "uncleared"
  | "overload";

export type CaptchaNext = "" | "allow" | "challenge";
export type CaptchaWrite = "addr" | "net" | "net_all" | "asn" | "cid";

export interface CaptchaEventRule {
  on: CaptchaOn;
  at?: number | null;
  bucket: string;
  next: CaptchaNext;

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
  ttlS: number;
  write: CaptchaWrite;

  charge: string;
  percent: number;

  code: string;
}

export interface CaptchaGate {
  redirectMethods: string[];
  redirectStatus: number;
  denyResponse: string;
  htmlOnly: boolean;
  inline: boolean;
}

export interface CaptchaProviderRef {
  kind: CaptchaProviderKind;
  length: number;
  audio: boolean;
}

export interface CaptchaExternalConfig {
  version: string;
  sitekey: string;
  secretEnv: string;
  secretStore: string | null;
  minScore: number;
  remoteip: boolean;
  timeoutS: number;
  onError: CaptchaOnError;
}

export interface CaptchaProviderConfig {
  image: { alphabet: string; languages: string[]; audioDir: string };
  turnstile: CaptchaExternalConfig;
  recaptcha: CaptchaExternalConfig;
  hcaptcha: CaptchaExternalConfig;
  smartcaptcha: CaptchaExternalConfig;
}

export interface CaptchaClearance {
  cookie: string;
  idCookie: string;
  ttlS: number;
  bind: string[];
  subnet: { v4: number; v6: number };
  list: string;
  graceS: number;
}

export interface CaptchaFingerprint {
  collect: boolean;
  canvas: boolean;
  farmAt: number;
  windowS: number;
}

export interface CaptchaLimits {
  issuePerSubnet: string;
  verifyPerSubnet: string;
  pendingMax: number;
  providerBudget: string;
}

export interface CaptchaRoster {
  store: "redis" | "memory";
  prefix: string;
  revokeRefreshMs: number;
}

export interface CaptchaProfileDoc {
  path: string;
  title: string;
  note: string;
  page: string;
  trigger: CaptchaTrigger;
  buckets: CaptchaBuckets;
  rules: CaptchaEventRule[];
  gate: CaptchaGate;
  provider: CaptchaProviderRef;
  fallback: CaptchaProviderRef | null;
  providerConfig: CaptchaProviderConfig;
  challenge: { cookie: string; ttlS: number };
  clearance: CaptchaClearance;
  fingerprint: CaptchaFingerprint;
  limits: CaptchaLimits;
  upstream: { header: string };
  roster: CaptchaRoster;
  languages: string[];
}

export interface CaptchaProfileMeta {
  id: string;
  httpSpaceId: string;
  serverId: string | null;
  name: string;
  description: string;
  when: CaptchaWhen;
  provider: CaptchaProviderKind;
  fallback: CaptchaProviderKind | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaptchaProfile extends CaptchaProfileMeta {
  doc: CaptchaProfileDoc;
}
