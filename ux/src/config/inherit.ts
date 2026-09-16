import type { InheritFrom, InheritedField } from "../api.ts";

export type Doc = Record<string, unknown>;

export type FieldState = "inherit" | "set" | "off";

export type Level = "http" | "server" | "location";

export interface Resolved {
  state: FieldState;
  value: unknown;
  from?: InheritFrom | "module";
}

export const MODULE_DEFAULTS: Record<string, unknown> = {
  enabled: false,
  deadlineMs: 50,
  exception: [
    "request timeout deny",
    "request absent deny",
    "request bus pass",
    "request body deny",
    "request inspector deny",
  ],
  denyMode: "fast",
  bodyLimit: "1m",
  bodyLimitPolicy: "block",
  denyResponseDefault: "blocked",
  actionMax: "192",
  actionsMax: 16,
  debugHeader: false,
  capture: ["headers", "args"],
  archive: [],
  preview: [],
  send: [
    "request headers=store args=store body=original",
    "response headers=store body=original",
    "frame:c2s body=original",
    "frame:s2c body=original",
  ],
  cookieDefaults: { secure: true, httpOnly: true, sameSite: "Lax" },
  responseHold: "gate",
  gzipVary: false,
  gzipCompLevel: 1,
  gzipMinLength: 20,
};

const EMPTY_MEANS_OFF = new Set([
  "capture",
  "localChecks",
  "localRates",
  "redirectAllow",
  "archive",
  "preview",
]);

export function isOff(key: string, value: unknown): boolean {
  if (value === "none" || value === "off") {
    return true;
  }
  return EMPTY_MEANS_OFF.has(key) && Array.isArray(value) && value.length === 0;
}

export type ParentChain = Record<string, { value: unknown; from: InheritFrom }>;

export function chainOf(
  inherited: InheritedField[] | null,
  section: "waf" | "nginx",
): ParentChain {
  const out: ParentChain = {};
  for (const field of inherited ?? []) {
    if (field.section !== section) continue;
    out[field.key] = { value: field.value, from: field.from };
  }
  return out;
}

export function resolve(doc: Doc, key: string, parents: ParentChain): Resolved {
  const own = doc[key];

  if (own !== undefined) {
    return isOff(key, own)
      ? { state: "off", value: own }
      : { state: "set", value: own };
  }

  const parent = parents[key];
  if (parent !== undefined) {
    return { state: "inherit", value: parent.value, from: parent.from };
  }

  const fallback = MODULE_DEFAULTS[key];
  return fallback === undefined
    ? { state: "inherit", value: undefined }
    : { state: "inherit", value: fallback, from: "module" };
}

export function seedFor(key: string, resolved: Resolved): unknown {
  if (resolved.value !== undefined) {
    return resolved.value;
  }
  const fallback = MODULE_DEFAULTS[key];
  return fallback === undefined ? "" : fallback;
}

export function offValue(key: string): unknown {
  return EMPTY_MEANS_OFF.has(key) ? [] : "none";
}

export function setKey(doc: Doc, key: string, value: unknown): Doc {
  const next = { ...doc };
  if (value === undefined || value === "" || value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

export function dropKey(doc: Doc, key: string): Doc {
  const next = { ...doc };
  delete next[key];
  return next;
}

export function describe(key: string, value: unknown): string {
  if (value === undefined || value === null) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "on" : "off";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map((v) => describeItem(v)).join(" ");
  }
  if (typeof value === "object") {
    return describeObject(key, value as Doc);
  }
  const text = String(value);
  return key.endsWith("Ms") ? `${text}ms` : text;
}

function describeItem(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return String(value);
  }
  const row = value as Doc;
  if (typeof row.name === "string") {
    return row.name;
  }
  if (typeof row.dataset === "string") {
    return String(row.dataset);
  }
  if (typeof row.path === "string") {
    return String(row.path);
  }
  return JSON.stringify(row);
}

function describeObject(key: string, row: Doc): string {
  if (key === "scoreDeny" || key === "responseScoreDeny") {
    const threshold = typeof row.threshold === "number" ? String(row.threshold) : "—";
    return row.response ? `${threshold} → ${String(row.response)}` : threshold;
  }
  if (key === "errorLog") {
    return [row.path, row.level].filter(Boolean).join(" ");
  }
  if (key === "cookieDefaults") {
    const parts: string[] = [];
    if (row.secure !== undefined) parts.push(`secure=${row.secure ? "on" : "off"}`);
    if (row.httpOnly !== undefined) parts.push(`http_only=${row.httpOnly ? "on" : "off"}`);
    if (row.sameSite) parts.push(`same_site=${String(row.sameSite)}`);
    return parts.join(" ") || "—";
  }
  if (key === "shmZone") {
    return `${String(row.name ?? "")} ${String(row.size ?? "")}`.trim();
  }
  return JSON.stringify(row);
}
