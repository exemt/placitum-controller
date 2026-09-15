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

export interface LogSink {
  add(level: Level, line: string): void;
}

let sink: LogSink | null = null;

export function attachSink(next: LogSink | null): void {
  sink = next;
}

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
