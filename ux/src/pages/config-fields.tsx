import { Bytes, type ByteHint, type ByteUnit } from "../components/fields.tsx";

export { Bytes, Choice, Flag, Num, Section, Text, Tri } from "../components/fields.tsx";
export type { ByteHint, ByteUnit } from "../components/fields.tsx";

export type Doc = Record<string, unknown>;

export function asRecord(value: unknown): Doc {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Doc) };
  }
  return {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asOptBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function asOptNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asNumText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function asListText(value: unknown): string {
  return asStringList(value).join(", ");
}

export function parseList(text: string): string[] | undefined {
  const items = text
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length === 0 ? undefined : items;
}

export function parseIntList(text: string): number[] | undefined {
  return parseIntChips(parseList(text));
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function asIntListText(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    .map(String);
}

export function parseIntChips(items: string[] | undefined): number[] | undefined {
  if (items === undefined) {
    return undefined;
  }
  const nums: number[] = [];
  for (const item of items) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1) {
      continue;
    }
    if (!nums.includes(n)) {
      nums.push(n);
    }
  }
  return nums.length === 0 ? undefined : nums;
}

export function parseNum(text: string): number | undefined {
  if (text.trim() === "") {
    return undefined;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

const SIZE_FACTOR: Record<string, number> = {
  k: 1024,
  m: 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

export function parseSize(text: string): number | undefined {
  const raw = text.trim();
  if (raw === "") {
    return undefined;
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)([kmg])?$/i);
  if (match === null) {
    return undefined;
  }
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  const suffix = (match[2] ?? "").toLowerCase();
  return Math.round(n * (SIZE_FACTOR[suffix] ?? 1));
}

export function formatSize(bytes: number): string {
  if (bytes % (1024 * 1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024 * 1024)}g`;
  }
  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)}m`;
  }
  if (bytes % 1024 === 0) {
    return `${bytes / 1024}k`;
  }
  return String(bytes);
}

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

export const SIZE_HINTS = {
  shm: [
    { label: "8m", value: 8 * MB, default: true },
    { label: "16m", value: 16 * MB },
    { label: "32m", value: 32 * MB },
    { label: "64m", value: 64 * MB },
    { label: "128m", value: 128 * MB },
    { label: "256m", value: 256 * MB },
  ],
  pending: [
    { label: "1m", value: MB },
    { label: "8m", value: 8 * MB, default: true },
    { label: "16m", value: 16 * MB },
    { label: "32m", value: 32 * MB },
  ],
  reply: [
    { label: "8k", value: 8 * KB, default: true },
    { label: "16k", value: 16 * KB },
    { label: "32k", value: 32 * KB },
    { label: "64k", value: 64 * KB },
    { label: "256k", value: 256 * KB },
  ],
  header: [
    { label: "4k", value: 4 * KB, default: true },
    { label: "8k", value: 8 * KB },
    { label: "16k", value: 16 * KB },
    { label: "32k", value: 32 * KB },
  ],
  headerBuffer: [
    { label: "1k", value: KB, default: true },
    { label: "2k", value: 2 * KB },
    { label: "4k", value: 4 * KB },
    { label: "8k", value: 8 * KB },
  ],
  bodyBuffer: [
    { label: "8k", value: 8 * KB },
    { label: "16k", value: 16 * KB, default: true },
    { label: "32k", value: 32 * KB },
    { label: "128k", value: 128 * KB },
    { label: "256k", value: 256 * KB },
  ],
  inline: [
    { label: "4k", value: 4 * KB },
    { label: "8k", value: 8 * KB },
    { label: "16k", value: 16 * KB, default: true },
    { label: "32k", value: 32 * KB },
    { label: "64k", value: 64 * KB },
  ],
  body: [
    { label: "512k", value: 512 * KB },
    { label: "1m", value: MB, default: true },
    { label: "8m", value: 8 * MB },
    { label: "16m", value: 16 * MB },
    { label: "64m", value: 64 * MB },
    { label: "1g", value: GB },
  ],
  payload: [
    { label: "256k", value: 256 * KB },
    { label: "1m", value: MB, default: true },
    { label: "4m", value: 4 * MB },
    { label: "8m", value: 8 * MB },
  ],
  /* gzip_min_length: умолчание -- 20 байт, дальше обычные пороги. */
  gzipMin: [
    { label: "20", value: 20, default: true },
    { label: "256", value: 256 },
    { label: "1k", value: KB },
    { label: "4k", value: 4 * KB },
  ],
  hashBucket: [
    { label: "32", value: 32 },
    { label: "64", value: 64, default: true },
    { label: "128", value: 128 },
    { label: "256", value: 256 },
    { label: "512", value: 512 },
    { label: "32k", value: 32 * KB },
  ],
  hashMax: [
    { label: "512", value: 512, default: true },
    { label: "1k", value: KB },
    { label: "2k", value: 2 * KB },
    { label: "4k", value: 4 * KB },
    { label: "8k", value: 8 * KB },
    { label: "32k", value: 32 * KB },
  ],
} as const;

export const BODY_MAX_HINTS = SIZE_HINTS.body;

/** Подстановки длительностей, в миллисекундах (`Duration base="ms"`). */
export const MS_PRESETS = {
  short: [100, 500, 1000, 5000],
  timeout: [5000, 15000, 30000, 60000, 120000],
  interval: [1000, 5000, 10000, 30000, 60000],
} as const;

/** Подстановки длительностей, в секундах (`Duration base="s"`). */
export const S_PRESETS = {
  keepalive: [15, 30, 65, 75, 120],
  keepaliveTime: [300, 900, 3600, 7200],
} as const;

export function SizeField({
  name,
  label,
  helper,
  value,
  onChange,
  units,
  hints,
  defaultSize,
  optional,
  wide,
}: {
  name?: string;
  label: string;
  helper?: string;
  value: unknown;
  onChange: (text: string | undefined) => void;
  units?: readonly ByteUnit[];
  hints?: readonly ByteHint[];
  defaultSize?: string;
  optional?: boolean;
  wide?: boolean;
}) {
  return (
    <Bytes
      name={name}
      label={label}
      helper={helper}
      value={parseSize(asString(value))}
      defaultValue={defaultSize === undefined ? undefined : parseSize(defaultSize)}
      units={units}
      hints={hints}
      optional={optional}
      wide={wide}
      onChange={(bytes) => onChange(bytes === undefined ? undefined : formatSize(bytes))}
    />
  );
}

export function setKey(doc: Doc, key: string, value: unknown): Doc {
  const next = { ...doc };
  if (value === undefined || value === "") {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

export function setNested(doc: Doc, key: string, nested: Doc): Doc {
  return Object.keys(nested).length === 0
    ? setKey(doc, key, undefined)
    : { ...doc, [key]: nested };
}

/**
 * Узел реестра `waf_inspector`. Опции ровно те, что принимает директива:
 * `subject=` (из каталога), `profile=`, `audit=`, `breaker*`. Плюс `process`:
 * он не печатается, но говорит, чья строка каталога даёт `subject=`, --
 * без него объявление-алиас ищет в каталоге само себя и не находит.
 *
 * `needs=`, `body=`, `after=`, `timeout=`, `sample=`, `role=`,
 * `placement=`, `allow_headers`, `allow_cookies` на реестре роняют `nginx -t`
 * -- см. docs/directives/list/inspector.md, раздел «не здесь». Это опции
 * вызова (`waf_inspect`) либо их нет вовсе, поэтому сохранение их выбрасывает,
 * а не переносит: узел, где они лежат, выглядит настроенным и таковым не
 * является.
 */
function sanitizeInspectorGraph(value: unknown): Record<string, Doc> | undefined {
  const rec = asRecord(value);
  const next: Record<string, Doc> = {};

  for (const [rawName, item] of Object.entries(rec)) {
    const name = rawName.trim();
    if (name === "") {
      continue;
    }
    const raw =
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Doc)
        : {};
    const row: Doc = {};

    // Ссылка на самого себя -- умолчание, её не пишем (как clean в реестре).
    const process = asString(raw.process).trim();
    if (process !== "" && process !== name) {
      row.process = process;
    }
    const profile = asString(raw.profile).trim();
    if (profile !== "" && profile !== "default") {
      row.profile = profile;
    }
    const audit = asString(raw.audit).trim();
    if (audit !== "") {
      row.audit = audit;
    }

    const breaker = asRecord(raw.breaker);
    const nextBreaker: Doc = {};
    if (typeof breaker.enabled === "boolean") {
      nextBreaker.enabled = breaker.enabled;
    }
    // Доля таймаутов на окне, не счётчик: умолчание 0.5.
    if (typeof breaker.threshold === "number" && Number.isFinite(breaker.threshold)) {
      nextBreaker.threshold = Math.min(1, Math.max(0, breaker.threshold));
    }
    if (typeof breaker.windowMs === "number" && breaker.windowMs > 0) {
      nextBreaker.windowMs = breaker.windowMs;
    }
    if (typeof breaker.probeMs === "number" && breaker.probeMs > 0) {
      nextBreaker.probeMs = breaker.probeMs;
    }
    if (Object.keys(nextBreaker).length > 0) {
      row.breaker = nextBreaker;
    }

    // `vars=`: имена полей секции vars. Что такое поле есть, проверит компилятор.
    if (Array.isArray(raw.vars)) {
      const vars: string[] = [];
      for (const item of raw.vars) {
        const text = asString(item).trim();
        if (text !== "" && !vars.includes(text)) {
          vars.push(text);
        }
      }
      if (vars.length > 0) {
        row.vars = vars;
      }
    }

    next[name] = row;
  }

  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * `waf` пространства -- только реестр инспекторов.
 *
 * Контур объявляет, какие инспекторы есть; что делать с запросом -- решает
 * сервер и при необходимости переопределяет путь. На проде серверы принадлежат
 * разным клиентам, и общий на контур бюджет с общим набором инспекторов для них
 * либо избыточен, либо недостаточен.
 *
 * Компилятор ключ решения здесь отвергает (`route_at_http`), поэтому документ,
 * где он остался от прежней модели, чинится при первом сохранении, а не
 * блокирует форму навсегда.
 */
const HTTP_WAF_KEYS = new Set(["inspectors", "inspectorProfiles"]);

export function sanitizeHttpWaf(waf: Doc): Doc {
  const next = sanitizeWaf(waf);
  for (const key of Object.keys(next)) {
    if (!HTTP_WAF_KEYS.has(key)) {
      delete next[key];
    }
  }
  return next;
}

export function sanitizeWaf(waf: Doc): Doc {
  const next = { ...waf };
  const graph = sanitizeInspectorGraph(next.inspectors);
  if (graph === undefined) {
    delete next.inspectors;
  } else {
    next.inspectors = graph;
  }
  const score = asRecord(next.scoreDeny);
  if (typeof score.threshold !== "number") {
    delete next.scoreDeny;
  }
  const respScore = asRecord(next.responseScoreDeny);
  if (typeof respScore.threshold !== "number") {
    delete next.responseScoreDeny;
  }
  const frameScore = asRecord(next.frameScoreDeny);
  if (typeof frameScore.threshold !== "number") {
    delete next.frameScoreDeny;
  }
  const cookie = asRecord(next.cookieDefaults);
  if (Object.keys(cookie).length === 0) {
    delete next.cookieDefaults;
  }
  if (next.localChecks !== undefined) {
    next.localChecks = sanitizeLocalChecks(next.localChecks);
  }
  if (next.localRates !== undefined) {
    next.localRates = sanitizeLocalRates(next.localRates);
  }
  return sanitizeProtectFields(next);
}

/**
 * `if <значение> in|not in <набор>` -- условие строки. Недобранное условие
 * (нет значения или набора) выбрасывается: компилятор такую строку не соберёт
 * (`cond_incomplete`), а в форме она читается как настроенная.
 */
function sanitizeConds(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const text = asString(rec.value).trim();
    const dataset = asString(rec.dataset).trim();
    if (text === "" || dataset === "") {
      continue;
    }
    const row: Record<string, unknown> = { value: text, dataset };
    if (rec.negate === true) {
      row.negate = true;
    }
    rows.push(row);
  }
  return rows;
}

function sanitizeLocalChecks(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const dataset = asString(rec.dataset).trim();
    const variable = asString(rec.variable).trim();
    if (dataset === "" || variable === "") {
      continue;
    }
    const action =
      rec.action === "allow" || rec.action === "wave" || rec.action === "block"
        ? rec.action
        : "block";
    const row: Record<string, unknown> = { dataset, variable, action };
    if (
      action === "block" &&
      typeof rec.response === "string" &&
      rec.response.trim() !== ""
    ) {
      row.response = rec.response.trim();
    }
    const conds = sanitizeConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Строка лимита сохраняется целиком или не сохраняется вовсе: `key`, `rate` и
 * `burst` у директивы обязательны, и контроллер документ с недобранной строкой
 * отвергает целиком (`invalid_local_rates`) -- то есть недописанная строка
 * стоила бы всей карточки.
 */
function sanitizeLocalRates(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const key = asString(rec.key).trim();
    const rate = asString(rec.rate).trim();
    if (key === "" || rate === "") {
      continue;
    }
    const burst =
      typeof rec.burst === "number" && Number.isInteger(rec.burst) && rec.burst >= 0
        ? rec.burst
        : 0;
    const row: Record<string, unknown> = { key, rate, burst };
    const conds = sanitizeConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    if (rec.count === "waves" || rec.count === "frames") {
      row.count = rec.count;
    }
    if (rec.action === "pass") {
      /*
       * `action=pass` не совмещается ни со страницей, ни с автобаном: модуль
       * такую строку отвергает на `nginx -t`, потому что пропущенному запросу
       * нечего показать, а банить ключ и пропускать его -- противоречие.
       */
      row.action = "pass";
      rows.push(row);
      continue;
    }
    for (const field of ["response", "list", "ttl"] as const) {
      const text = asString(rec[field]).trim();
      if (text !== "") {
        row[field] = text;
      }
    }
    // `ttl=` без `list=` -- ошибка директивы: срок задан тому, чего нет.
    if (row.list === undefined) {
      delete row.ttl;
    }
    rows.push(row);
  }
  return rows;
}

function isInspectorMode(
  value: unknown,
): value is "active" | "passive" | "vote" | "off" | "ignore" {
  return (
    value === "active" ||
    value === "passive" ||
    value === "vote" ||
    value === "off" ||
    value === "ignore"
  );
}

function sanitizeProtectFields(waf: Doc): Doc {
  const next = { ...waf };
  for (const key of ["requestInspectors", "responseInspectors", "frameInspectors"] as const) {
    const value = next[key];
    if (value === "all" || value === "none") {
      continue;
    }
    if (!Array.isArray(value)) {
      delete next[key];
      continue;
    }
    // Вызов сохраняется целиком: `wave=` у директивы обязателен (без номера
    // строка не грузится, пустой -- волна 0), timeout/mode -- её же опции.
    // `profile=` и `weight=` сняты: первое -- опция реестра, второго нет
    // нигде, на вызове оба -- `nginx -t`.
    // `keep=` есть только у фазы запроса, `resume=` -- только у ответа:
    // на чужой фазе парсер контроллера ключ отвергает, поэтому здесь он не
    // переносится вовсе, а не отправляется на отказ.
    const refs: Record<string, unknown>[] = [];
    for (const item of value) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const rec = item as Doc;
      const name = asString(rec.name).trim();
      if (name === "") {
        continue;
      }
      const row: Record<string, unknown> = { name };
      const conds = sanitizeConds(rec.conds);
      if (conds.length > 0) {
        row.conds = conds;
      }
      if (typeof rec.wave === "number" && Number.isInteger(rec.wave) && rec.wave >= 0) {
        row.wave = rec.wave;
      } else {
        row.wave = 0;
      }
      if (typeof rec.timeoutMs === "number" && rec.timeoutMs > 0) {
        row.timeoutMs = rec.timeoutMs;
      }
      if (isInspectorMode(rec.mode)) {
        row.mode = rec.mode;
      }
      if (key === "requestInspectors" && rec.keep === true) {
        row.keep = true;
      }
      // `resume=` -- только у ответа: кадры инспектируются каждый сам по себе
      // и транзакцию рукопожатия не продолжают, на них ключ -- `nginx -t`.
      if (
        key === "responseInspectors" &&
        (rec.resume === "off" || rec.resume === "prefer" || rec.resume === "require")
      ) {
        row.resume = rec.resume;
      }
      refs.push(row);
    }
    // Пустой «задать» -- это «никого», а не «как у родителя». delete здесь
    // стёр бы ключ, и очищенный оператором набор молча стал бы наследованием:
    // WafProtect различает inherit/none/override, а печать идёт по ключу, и
    // отсутствие ключа компилятор читает как inherit. Пустой список сводим к
    // first-class "none".
    next[key] = refs.length === 0 ? "none" : refs;
  }
  const modes = asRecord(next.inspectorModes);
  const modeMap: Record<string, unknown> = {};
  for (const [name, mode] of Object.entries(modes)) {
    if (isInspectorMode(mode)) {
      modeMap[name] = mode;
    }
  }
  if (Object.keys(modeMap).length === 0) {
    delete next.inspectorModes;
  } else {
    next.inspectorModes = modeMap;
  }
  const profiles = asRecord(next.inspectorProfiles);
  const profileMap: Record<string, unknown> = {};
  for (const [name, profile] of Object.entries(profiles)) {
    if (typeof profile === "string" && profile.trim() !== "") {
      profileMap[name] = profile.trim();
    }
  }
  if (Object.keys(profileMap).length === 0) {
    delete next.inspectorProfiles;
  } else {
    next.inspectorProfiles = profileMap;
  }
  return next;
}

export function sanitizeHeaders(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const headers = value.filter((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return false;
    }
    const item = row as Doc;
    return asString(item.name) !== "" && asString(item.value) !== "";
  });
  return headers.length === 0 ? undefined : headers;
}
