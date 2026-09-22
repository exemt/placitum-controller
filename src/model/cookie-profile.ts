import type { ActionAsk, ActionMatch, ActionWrite } from "./action-profile.ts";

export type { ActionAsk, ActionMatch };

export type CookieWrite = ActionWrite | "cookie";

export type CookieListOp = "add" | "remove";

export const COOKIE_STATES = ["absent", "present", "invalid", "expired"] as const;

export type CookieState = (typeof COOKIE_STATES)[number];

export const COOKIE_SIGNS = ["hmac", "none"] as const;

export type CookieSign = (typeof COOKIE_SIGNS)[number];

export const COOKIE_PHASES = ["request", "response"] as const;

export type CookiePhase = (typeof COOKIE_PHASES)[number];

export interface CookieValue {
  from: string;
  default: string;
  random: number;
  maxLen: number;
}

export interface CookieDecl {
  name: string;
  path: string;
  maxAgeS: number;
  renewAfterS: number;
  sign: CookieSign;
  value: CookieValue;
}

export interface CookieAsk extends Omit<ActionAsk, "write"> {
  write: CookieWrite;
  op: CookieListOp;
  cookie: string;
}

export interface CookieRule {
  name: string;
  match: ActionMatch;
  phase: CookiePhase | "";
  status: number[];
  on: CookieState | "overload" | "";
  at?: number | null;
  cookie: string;
  tags: string[];
  issue: string;
  drop: string;
  actions: CookieAsk[];
}

export interface CookieProfileDoc {
  description: string;
  cookies: CookieDecl[];
  rules: CookieRule[];
}

export interface CookieProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
