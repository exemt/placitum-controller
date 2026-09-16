export type RewriteBodyOpKind =
  | "remove"
  | "replace"
  | "insert_before"
  | "insert_after";

export interface RewriteBodyOp {
  op: RewriteBodyOpKind;
  pattern: string;
  to: string;
  text: string;
  maxMatches: number | null;
}

export interface RewriteHeaderOp {
  op: "set" | "unset";
  name: string;
  value: string;
}

export type RewriteGroupOn = "response" | "frame";

export const REWRITE_DIRECTIONS = ["c2s", "s2c"] as const;
export const REWRITE_OPCODES = ["text", "binary", "continuation"] as const;

export interface RewriteGroup {
  name: string;
  default: boolean;
  on: RewriteGroupOn;
  status: number[];
  contentType: string[];
  direction: string[];
  opcode: string[];
  body: RewriteBodyOp[];
  headers: RewriteHeaderOp[];
}

export interface RewritePriorRule {
  from: string;
  accept: ("mutate" | "skip")[];
  codes: string[];
}

export interface RewriteProfileDoc {
  description: string;
  denyResponse: string;
  groups: RewriteGroup[];
  prior: RewritePriorRule[];
}

export interface RewriteProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: RewriteProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
