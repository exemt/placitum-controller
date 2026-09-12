/**
 * Разбор тел запросов раздела «Адрес»: имена, списки uuid, коды стран и
 * номера ASN. Общий для наборов и профилей -- блоки у них одни и те же.
 */

import { asUuid } from "./model/id.ts";

const COUNTRY_RE = /^[a-z]{2}$/;
const ASN_MAX = 4_294_967_295;

export function parseName(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return "bad";
  }

  const name = value.trim();

  return name.length === 0 ? "bad" : name;
}

export function parseText(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : "bad";
}

export function parseIds(value: unknown): string[] | "bad" {
  if (!Array.isArray(value)) {
    return "bad";
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const id = asUuid(item);

    if (id === undefined || seen.has(id)) {
      return "bad";
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function parseAsns(value: unknown): number[] | "bad" {
  if (!Array.isArray(value)) {
    return "bad";
  }

  const out: number[] = [];
  const seen = new Set<number>();

  for (const item of value) {
    const n =
      typeof item === "number"
        ? item
        : typeof item === "string" && /^\d+$/.test(item.trim())
          ? Number(item.trim())
          : NaN;

    if (!Number.isInteger(n) || n <= 0 || n > ASN_MAX || seen.has(n)) {
      return "bad";
    }

    seen.add(n);
    out.push(n);
  }

  return out;
}

export function parseCountries(value: unknown): string[] | "bad" {
  if (!Array.isArray(value)) {
    return "bad";
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      return "bad";
    }

    const cc = item.trim().toLowerCase();

    if (!COUNTRY_RE.test(cc) || seen.has(cc)) {
      return "bad";
    }

    seen.add(cc);
    out.push(cc);
  }

  return out;
}

/**
 * Повод: тот же алфавит, что у reason.code модуля. Пустая строка означает
 * «кода нет» -- инспектор подставит свой.
 */
export function parseCode(value: unknown): string | "bad" {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    return "bad";
  }

  const code = value.trim();

  if (code === "") {
    return "";
  }

  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "bad";
}
