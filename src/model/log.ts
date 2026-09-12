/**
 * `access_log` и `error_log` одного блока nginx.
 *
 * Директива есть в http, server и location, и наследуется как всё остальное
 * ядро: ключа нет -- родительская, ключ есть -- заменяет её целиком. Поэтому
 * лог живёт тем же полем `nginx`, что и прочие директивы уровня, а не своей
 * таблицей.
 *
 * `access_log` -- массив: nginx допускает несколько строк в одном блоке, и
 * писать в два места (общий лог и лог хоста) иначе было бы нечем. `"off"` --
 * не путь, а отдельная форма директивы: `= /healthz` глушится именно ею, и
 * пустой массив для этого не годится -- он означал бы «ключа нет».
 *
 * В jsonb исторически лежала строка -- хвост директивы целиком
 * (`/var/log/nginx/error.log info`). Нормализаторы её принимают: база не
 * валидируется при чтении, и старая строка обязана печататься так же, как
 * печаталась.
 */

/**
 * Сокет логов агента ноды (`log_sock`, nginx/agent/internal/nginxlog): оттуда
 * строки уезжают в waf.log. Адрес задаёт агент, и расхождение с его log_sock —
 * ровно тот случай, когда строки исчезают молча.
 */
export const AGENT_LOG_SOCK = "/var/run/waf/log.sock";

/** Приёмник `error_log`/`access_log` в сокет агента. Тег — колонка service. */
export function agentSyslog(tag = "nginx"): string {
  return `syslog:server=unix:${AGENT_LOG_SOCK},tag=${tag},nohostname`;
}

export const ERROR_LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
  "emerg",
] as const;

export type ErrorLogLevel = (typeof ERROR_LOG_LEVELS)[number];

export function isErrorLogLevel(value: string): value is ErrorLogLevel {
  return (ERROR_LOG_LEVELS as readonly string[]).includes(value);
}

/** Одна строка `access_log`. `format` -- имя из каталога, не текст формата. */
export interface AccessLogEntry {
  path: string;
  format?: string;
  /** `if=$loggable`: значение без `if=`. */
  condition?: string;
  buffer?: string;
  flush?: string;
  gzip?: number;
}

/** `"off"` -- `access_log off;`. Массив -- по строке на приёмник. */
export type AccessLog = "off" | AccessLogEntry[];

export interface ErrorLog {
  path: string;
  level?: ErrorLogLevel;
}

/** Блок, у которого может быть свой лог. Один тип на http, server и location. */
export interface LogSettings {
  accessLog?: AccessLog;
  errorLog?: ErrorLog;
}

/**
 * Хвост строки в объект. Старая форма хранения и то, что оператор вводит
 * одной строкой, разбираются одинаково.
 */
export function parseAccessLogTail(tail: string): AccessLogEntry | "off" | undefined {
  const parts = tail.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  if (parts[0] === "off") {
    return "off";
  }
  const row: AccessLogEntry = { path: parts[0] };
  for (const part of parts.slice(1)) {
    if (part.startsWith("if=")) {
      row.condition = part.slice(3);
    } else if (part.startsWith("buffer=")) {
      row.buffer = part.slice(7);
    } else if (part.startsWith("flush=")) {
      row.flush = part.slice(6);
    } else if (part.startsWith("gzip=")) {
      const n = Number(part.slice(5));
      if (Number.isInteger(n)) {
        row.gzip = n;
      }
    } else if (row.format === undefined) {
      row.format = part;
    }
  }
  return row;
}

export function parseErrorLogTail(tail: string): ErrorLog | undefined {
  const parts = tail.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  const row: ErrorLog = { path: parts[0] };
  const level = parts[1];
  if (level !== undefined && isErrorLogLevel(level)) {
    row.level = level;
  }
  return row;
}

/** Любая из трёх форм jsonb -> список строк для печати. Пустой -- директивы нет. */
export function accessLogTails(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (value === "off") {
    return ["off"];
  }
  if (typeof value === "string") {
    const parsed = parseAccessLogTail(value);
    if (parsed === undefined) {
      return [];
    }
    return parsed === "off" ? ["off"] : [formatAccessLog(parsed)];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const tails: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const parsed = parseAccessLogTail(item);
      if (parsed !== undefined) {
        tails.push(parsed === "off" ? "off" : formatAccessLog(parsed));
      }
      continue;
    }
    if (item === null || typeof item !== "object") {
      continue;
    }
    const row = item as Partial<AccessLogEntry>;
    if (typeof row.path !== "string" || row.path.trim() === "") {
      continue;
    }
    tails.push(formatAccessLog(row as AccessLogEntry));
  }
  return tails;
}

export function errorLogTail(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = parseErrorLogTail(value);
    return parsed === undefined ? undefined : formatErrorLog(parsed);
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const row = value as Partial<ErrorLog>;
  if (typeof row.path !== "string" || row.path.trim() === "") {
    return undefined;
  }
  return formatErrorLog(row as ErrorLog);
}

export function formatAccessLog(row: AccessLogEntry): string {
  const parts = [row.path];
  if (row.format) {
    parts.push(row.format);
  }
  if (row.buffer) {
    parts.push(`buffer=${row.buffer}`);
  }
  if (row.gzip !== undefined) {
    parts.push(`gzip=${row.gzip}`);
  }
  if (row.flush) {
    parts.push(`flush=${row.flush}`);
  }
  if (row.condition) {
    parts.push(`if=${row.condition}`);
  }
  return parts.join(" ");
}

export function formatErrorLog(row: ErrorLog): string {
  return row.level ? `${row.path} ${row.level}` : row.path;
}
