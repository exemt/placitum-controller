import { isIPv4, isIPv6 } from "node:net";

import type { DatasetType } from "./model/http-space.ts";

const STRING_MAX = 1024;
const NUMERIC_RE = /^-?(0|[1-9]\d{0,18})$/;

export type ParseEntriesOk = { ok: true; entries: string[] };
export type ParseEntriesFail = { ok: false; invalid: string[] };
export type ParseEntriesResult = ParseEntriesOk | ParseEntriesFail;

export function parseUploadLines(text: string): string[] {
  const lines: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    lines.push(line);
  }

  return lines;
}

export function parseDatasetEntry(
  type: DatasetType,
  raw: string,
): string | null {
  const value = raw.trim();

  if (value.length === 0) {
    return null;
  }

  switch (type) {
    case "string":
      return parseString(value);
    case "numeric":
      return parseNumeric(value);
    case "ipv4":
      return parseCidr(value, "ipv4");
    case "ip":
      return parseCidr(value, "ip");
  }
}

export function parseDatasetEntries(
  type: DatasetType,
  values: string[],
): ParseEntriesResult {
  const entries: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const parsed = parseDatasetEntry(type, raw);

    if (parsed === null) {
      invalid.push(raw.trim() === "" ? raw : raw.trim());
      continue;
    }

    if (seen.has(parsed)) {
      continue;
    }

    seen.add(parsed);
    entries.push(parsed);
  }

  if (invalid.length > 0) {
    return { ok: false, invalid };
  }

  return { ok: true, entries };
}

function parseString(value: string): string | null {
  if (value.length > STRING_MAX || value.includes("\0")) {
    return null;
  }

  return value;
}

function parseNumeric(value: string): string | null {
  return NUMERIC_RE.test(value) ? value : null;
}

function parseCidr(value: string, family: "ipv4" | "ip"): string | null {
  const slash = value.lastIndexOf("/");
  const addr = slash === -1 ? value : value.slice(0, slash);
  const maskRaw = slash === -1 ? undefined : value.slice(slash + 1);

  if (addr.length === 0) {
    return null;
  }

  if (isIPv4(addr)) {
    const mask = parseMask(maskRaw, 32);
    return mask === null ? null : `${addr}/${mask}`;
  }

  if (family === "ip" && isIPv6(addr)) {
    const mask = parseMask(maskRaw, 128);
    return mask === null ? null : `${addr}/${mask}`;
  }

  return null;
}

function parseMask(raw: string | undefined, max: number): number | null {
  if (raw === undefined) {
    return max;
  }

  if (!/^\d{1,3}$/.test(raw)) {
    return null;
  }

  const mask = Number(raw);

  if (!Number.isInteger(mask) || mask < 0 || mask > max) {
    return null;
  }

  return mask;
}
