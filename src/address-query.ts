import { isIPv4, isIPv6 } from "node:net";

export type AddressSearch =
  | { kind: "none" }
  | { kind: "host"; value: string }
  | { kind: "net"; value: string }
  | { kind: "text"; value: string };

const QUERY_MAX = 256;

export function parseAddressQuery(raw: string): AddressSearch {
  const q = raw.trim().slice(0, QUERY_MAX);

  if (q.length === 0) {
    return { kind: "none" };
  }

  const slash = q.lastIndexOf("/");

  if (slash >= 0) {
    const addr = q.slice(0, slash);
    const mask = parseMask(q.slice(slash + 1), familyMax(addr));

    if (mask !== null) {
      return { kind: "net", value: q };
    }

    return { kind: "text", value: q };
  }

  if (isIPv4(q) || isIPv6(q)) {
    return { kind: "host", value: q };
  }

  return { kind: "text", value: q };
}

export function addressSearchSql(
  search: AddressSearch,
  addressCol: string,
  param: number,
): { sql: string; values: unknown[] } {
  switch (search.kind) {
    case "none":
      return { sql: "", values: [] };
    case "host":
      return {
        sql: `and ${addressCol}::cidr >>= $${param}::inet`,
        values: [search.value],
      };
    case "net":
      return {
        sql: `and ${addressCol}::cidr && $${param}::inet`,
        values: [search.value],
      };
    case "text":
      return {
        sql: `and ${addressCol} like $${param} escape '\\'`,
        values: [`${escapeLike(search.value)}%`],
      };
  }
}

export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function familyMax(addr: string): number | null {
  if (isIPv4(addr)) {
    return 32;
  }

  if (isIPv6(addr)) {
    return 128;
  }

  return null;
}

function parseMask(raw: string, max: number | null): number | null {
  if (max === null || !/^\d{1,3}$/.test(raw)) {
    return null;
  }

  const mask = Number(raw);

  if (!Number.isInteger(mask) || mask < 0 || mask > max) {
    return null;
  }

  return mask;
}
