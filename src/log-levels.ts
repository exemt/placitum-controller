/**
 * Уровни журнала сервисов контура: документ `policy/log-levels` в KV
 * `WAF_DESIRED`.
 *
 *     {"v":1,"kind":"log-levels","rev":3,"levels":{"keeper":"debug"}}
 *
 * Один документ на контур, ключ — имя сервиса (колонка service в waf.log).
 * Пишет контроллер (панель «Журналы → Уровни», `/api/log-levels`), читают все
 * сервисы: Go — `internal/logkit/levels.go` в каждом модуле, сам контроллер —
 * main.ts. Своего ключа нет — порог стартовый, из окружения: так «снять»
 * значит «вернуть как было», а не «угадать, как было».
 *
 * Инспекторов в документе нет: их уровень — запись каталога, едет поколением
 * (inspector-settings.ts), и второй источник для того же порога только спорил
 * бы с первым. Словарь тот же — error_log nginx без emerg.
 */

import { isLogLevel, type LogLevel } from "./inspector-settings.ts";

export const LOG_LEVELS_KEY = "policy/log-levels";
export const LOG_LEVELS_KIND = "log-levels";

export interface LogLevelsDoc {
  v: 1;
  kind: typeof LOG_LEVELS_KIND;
  rev: number;
  levels: Record<string, LogLevel>;
}

export interface LogService {
  /** Колонка service в waf.log и ключ документа. */
  name: string;
  /** Переменная стартового порога: к ней уровень вернётся, когда ключ снимут. */
  env: string;
}

/**
 * Сервисы, которые читают документ. Список закрытый: сервис, которого здесь
 * нет, документ не читает, и строка для него в панели была бы ручкой в никуда.
 * Добавить сервис — это internal/logkit в его модуле и строка здесь.
 */
export const LOG_SERVICES: readonly LogService[] = [
  { name: "controller", env: "CONTROLLER_LOG" },
  { name: "agent", env: "WAF_AGENT_LOG" },
  { name: "haproxy-agent", env: "WAF_HAPROXY_AGENT_LOG" },
  { name: "keeper", env: "WAF_KEEPER_LOG" },
  { name: "geo", env: "WAF_GEO_LOG" },
  { name: "logger", env: "WAF_LOGGER_LOG" },
  { name: "search", env: "WAF_SEARCH_LOG" },
  { name: "crypto", env: "WAF_CRYPTO_LOG" },
  { name: "redis-agent", env: "WAF_REDIS_AGENT_LOG" },
  { name: "s3-agent", env: "WAF_S3_AGENT_LOG" },
];

const KNOWN = new Set(LOG_SERVICES.map((row) => row.name));

export function emptyLogLevels(): LogLevelsDoc {
  return { v: 1, kind: LOG_LEVELS_KIND, rev: 0, levels: {} };
}

/**
 * Разбор документа из KV. Чужой вид — null. Слова вне словаря выпадают по
 * одному: мусор в соседнем ключе — не повод терять остальные.
 */
export function parseLogLevelsDoc(value: unknown): LogLevelsDoc | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (row.v !== 1 || row.kind !== LOG_LEVELS_KIND) {
    return null;
  }

  const rev =
    typeof row.rev === "number" && Number.isInteger(row.rev) && row.rev >= 0 ? row.rev : 0;
  const levels: Record<string, LogLevel> = {};

  if (typeof row.levels === "object" && row.levels !== null && !Array.isArray(row.levels)) {
    for (const [name, word] of Object.entries(row.levels)) {
      if (isLogLevel(word)) {
        levels[name] = word;
      }
    }
  }

  return { v: 1, kind: LOG_LEVELS_KIND, rev, levels };
}

export type LogLevelsBody =
  | { ok: true; levels: Record<string, LogLevel> }
  | { ok: false; error: string };

/**
 * Тело PUT: `{levels: {<сервис>: <уровень> | null}}`. null или пустая строка —
 * снять ключ. Документ заменяется целиком: панель шлёт всю таблицу, и ключ,
 * которого в теле нет, тоже снят.
 */
export function parseLogLevelsBody(body: unknown): LogLevelsBody {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_body" };
  }

  const raw = (body as Record<string, unknown>).levels;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "invalid_levels" };
  }

  const levels: Record<string, LogLevel> = {};

  for (const [name, word] of Object.entries(raw)) {
    if (!KNOWN.has(name)) {
      return { ok: false, error: "unknown_service" };
    }

    if (word === null || word === "") {
      continue;
    }

    if (!isLogLevel(word)) {
      return { ok: false, error: "invalid_log_level" };
    }

    levels[name] = word;
  }

  return { ok: true, levels };
}

/** Порог сервиса по документу. Ключа нет — стартовый (из окружения). */
export function levelFor(
  doc: LogLevelsDoc | null,
  service: string,
  base: string,
): { level: string; source: "controller" | "env" } {
  const word = doc?.levels[service];

  return word === undefined
    ? { level: base, source: "env" }
    : { level: word, source: "controller" };
}
