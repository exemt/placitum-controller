import type { Hash } from "node:crypto";

export const LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = "info";

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

export interface InspectorSettings {
  log_level: LogLevel;
}

export const DEFAULT_INSPECTOR_SETTINGS: InspectorSettings = {
  log_level: DEFAULT_LOG_LEVEL,
};

export type InspectorSettingsSource = (
  spaceId: string,
  process: string,
) => Promise<InspectorSettings>;

export function fixedInspectorSettings(
  settings: InspectorSettings = DEFAULT_INSPECTOR_SETTINGS,
): InspectorSettingsSource {
  return async () => settings;
}

export function hashInspectorSettings(
  digest: Hash,
  settings: InspectorSettings | undefined,
): void {
  if (settings === undefined) {
    return;
  }

  digest.update("settings");
  digest.update("\0");
  digest.update("log_level");
  digest.update("\0");
  digest.update(settings.log_level);
  digest.update("\0");
}

export function parseInspectorSettings(
  value: unknown,
): InspectorSettings | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const level = (value as Record<string, unknown>).log_level;

  return isLogLevel(level) ? { log_level: level } : null;
}
