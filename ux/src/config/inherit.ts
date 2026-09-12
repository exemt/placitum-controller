/**
 * Три состояния ключа и то, откуда берётся значение, когда ключа нет.
 *
 * В модели ключ значит ровно одно из трёх, и это её центральное решение:
 *
 *   ключа нет            наследовать от родителя (или взять умолчание модуля)
 *   ключ есть            действовать тем, что записано
 *   [] / "none" / "off"  снять то, что разрешено выше
 *
 * Пока форма рисует все три одинаково пустым полем, оператор не может
 * прочитать конфигурацию, которую сам написал. Здесь состояние вычисляется, а
 * `InheritedRow` его показывает.
 *
 * Родительская цепочка приходит с контроллера (`…/inheritance`): он считает её
 * той же `resolveRoute`, которой пользуется компилятор, поэтому «наследует
 * 50ms» в форме и `waf_deadline request 50ms` в файле -- одно и то же число, а
 * не два независимых представления о нём.
 */

import type { InheritFrom, InheritedField } from "../api.ts";

export type Doc = Record<string, unknown>;

export type FieldState = "inherit" | "set" | "off";

/** Уровень, на котором открыта карточка. */
export type Level = "http" | "server" | "location";

export interface Resolved {
  state: FieldState;
  /** Действующее значение: своё при `set`, родительское при `inherit`. */
  value: unknown;
  /** Откуда пришло унаследованное. `module` -- умолчание самого модуля. */
  from?: InheritFrom | "module";
}

/**
 * Умолчания модуля и nginx: то, что действует, когда ключа нет ни на одном
 * уровне. Источник -- таблицы в `nginx/docs/module/directives.md`; здесь
 * только те ключи, у которых умолчание содержательно (оператор о нём должен
 * знать), а не «пусто».
 */
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
  /*
   * `waf_send`: умолчание модуля по объектам -- строками той же грамматики,
   * чтобы таблица показывала его в ячейках со скобкой «(умолчание)».
   * Заголовки и строка запроса -- store; тело -- store только при снимке
   * целиком, поэтому его умолчание считается по снимку маршрута
   * (`moduleSendDefaults` в CaptureTable), а здесь -- запасной вариант без
   * снимка тела.
   */
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

/** Ключи, у которых «снято» выражается пустым массивом. */
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

/**
 * Родительская цепочка одной секции: `{ key: { value, from } }`.
 * Ближний уровень уже победил -- контроллер отдаёт список плоским.
 */
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

/** Значение, с которого начинается переопределение: то, что действовало. */
export function seedFor(key: string, resolved: Resolved): unknown {
  if (resolved.value !== undefined) {
    return resolved.value;
  }
  const fallback = MODULE_DEFAULTS[key];
  return fallback === undefined ? "" : fallback;
}

/** Значение, которым ключ «снимается». */
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

/** Короткая подпись значения для строки «наследует …». */
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
