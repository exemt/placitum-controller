/*
 * Лог в одну строку JSON на событие — тот же формат, что у backend
 * и тестового инспектора.
 *
 * Порог — словарь error_log nginx без emerg, как у всего контура
 * (docs/logger/logs.md): debug, info, notice, warn, error, crit, alert. Сам
 * контроллер пишет только debug/info/warn/error, поэтому notice режет то же,
 * что warn, а crit и alert глушат журнал целиком.
 *
 * Строка уходит в stdout (warn и error — в stderr) и тем же вызовом в
 * приёмник, если он подключён (log-ship.ts): оттуда пачкой в waf.log.
 */

import { isLogLevel, type LogLevel } from "./inspector-settings.ts";

export type Level = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warn: 3,
  error: 4,
  crit: 5,
  alert: 6,
};

let threshold: LogLevel = "info";

/** Вторая дорога строки. Подключает её log-ship.ts. */
export interface LogSink {
  add(level: Level, line: string): void;
}

let sink: LogSink | null = null;

export function attachSink(next: LogSink | null): void {
  sink = next;
}

/**
 * Переставить порог. Ложь — слово не из словаря, порог не тронут. "warning"
 * принимается ради старых значений CONTROLLER_LOG, в словарь оно не входит.
 */
export function setLevel(level: string): boolean {
  const word = level.trim().toLowerCase();
  const next = word === "warning" ? "warn" : word;

  if (!isLogLevel(next)) {
    return false;
  }

  threshold = next;
  return true;
}

export function currentLevel(): LogLevel {
  return threshold;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (RANK[level] < RANK[threshold]) {
    return;
  }

  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }

  sink?.add(level, line);
}
