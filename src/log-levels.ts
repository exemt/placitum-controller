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
  name: string;
  env: string;
}

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
