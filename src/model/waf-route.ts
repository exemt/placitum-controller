export type FrameAudit = "off" | "deny" | "all";

export type Policy = "pass" | "block";
export type DenyMode = "fast" | "deterministic";
export type InspectorMode = "active" | "passive" | "vote" | "off" | "ignore";
export type InspectorPhase = "request" | "response" | "frame";

export type InspectorStream = "c2s" | "s2c" | "both";
export type InspectorResume = "off" | "prefer" | "require";
export type HoldMode = "gate" | "monitor";

export type BodyLevel = "none" | "meta" | `preview=${string}` | "full";
export type BodyLimitPolicy = "block" | "trim" | "pass";

export interface InspectorRef {
  name: string;
  wave?: number;
  timeoutMs?: number;
  mode?: InspectorMode;
  keep?: boolean;
  resume?: InspectorResume;
  phase?: InspectorPhase;
  stream?: InspectorStream;
  conds?: Cond[];
  profile?: string;
}

export interface InspectorDecl {
  process?: string;
  profile?: string;
  audit?: string;
  breaker?: {
    enabled?: boolean;
    threshold?: number;
    windowMs?: number;
    probeMs?: number;
  };
  vars?: string[];

  timeoutMs?: number;
  after?: string[];
  needs?: string;
  body?: string;
  sample?: number;
  role?: "mandatory" | "advisory";
  placement?: "remote" | "local";
  allowHeaders?: string[];
  allowCookies?: string[];
}

export interface Cond {
  value: string;
  dataset: string;
  negate?: boolean;
}

export interface LocalCheck {
  dataset: string;
  variable: string;
  action: "block" | "allow" | "wave";
  response?: string;
  conds?: Cond[];
}

export interface LocalRate {
  key: string;
  rate: string;
  burst: number;
  count?: "requests" | "waves" | "frames";
  action?: "block" | "pass";
  response?: string;
  list?: string;
  ttl?: string;
  hash?: boolean;
  conds?: Cond[];
}

export interface CookieDefaults {
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface ScoreDeny {
  threshold: number;
  response?: string;
}

export interface WafRouteSettings {
  enabled?: boolean;

  inspectors?: Record<string, InspectorDecl>;

  requestInspectors?: InspectorRef[] | "none" | "all";
  responseInspectors?: InspectorRef[] | "none" | "all";
  frameInspectors?: InspectorRef[] | "none" | "all";
  inspectorModes?: Record<string, InspectorMode>;
  inspectorProfiles?: Record<string, string>;

  deadlineMs?: number;
  responseDeadlineMs?: number;
  responseHold?: HoldMode;

  frameDeadlineMs?: number;
  frameScoreDeny?: ScoreDeny;

  frameAudit?: FrameAudit;
  frameAuditSample?: number;

  frameReassemble?: boolean;

  frameControlRate?: string;

  frameCacheTtl?: string;
  frameCacheStream?: "c2s" | "s2c" | "both";

  requireUpgrade?: boolean;
  requireUpgradeResponse?: string;
  wsStripExtensions?: string[];

  exception?: string[];
  denyMode?: DenyMode;

  scoreDeny?: ScoreDeny;
  responseScoreDeny?: ScoreDeny;

  archive?: string[];

  bodyLimit?: string;
  bodyLimitPolicy?: BodyLimitPolicy;

  denyResponseDefault?: string;
  redirectAllow?: string[];

  actionMax?: string;
  actionsMax?: number;
  cookieDefaults?: CookieDefaults;

  localChecks?: LocalCheck[];
  localRates?: LocalRate[];

  debugHeader?: boolean;
  capture?: string[];

  preview?: string[];

  send?: string[];
}

export function routeInspectsRequests(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (value === "none") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}
