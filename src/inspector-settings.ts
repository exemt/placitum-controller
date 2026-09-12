import type { Hash } from "node:crypto";

/**
 * Настройки процесса инспектора -- то, что едет в поколение рядом с
 * профилями, но файлом на ноду не ложится: применяется к самому процессу.
 * Источник -- строка каталога инспекторов (`inspectors.log_level`), а не
 * профиль: уровень журнала -- свойство процесса, у профиля его не бывает.
 *
 * Первая настройка -- уровень журнала. Строка info на каждое сообщение шины
 * под нагрузкой стоит половины пропускной способности, а рестарт ради
 * `WAF_<ИМЯ>_LOG` под прогоном обнуляет прогон. Поэтому значение едет
 * блоком `settings` манифеста и входит в канон `config_hash`: иначе флот не
 * заметил бы правку, и «Разослать» ничего бы не изменило.
 *
 * Словарь -- error_log nginx без emerg: оператор видит одни слова на краю и
 * у инспектора. Спека -- docs/inspector-config-distribution.md, раздел
 * «Настройки процесса».
 */

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

/**
 * Откуда сборщик поколения берёт настройки процесса: по пространству и имени
 * процесса (имя записи каталога, оно же `consumer.name` канала). Функция, а
 * не репозиторий: планировщику и `send` нужен один и тот же источник, а
 * тестам -- прибитое значение.
 */
export type InspectorSettingsSource = (
  spaceId: string,
  process: string,
) => Promise<InspectorSettings>;

/** Источник с одним ответом на всех: локальные прогоны и тесты. */
export function fixedInspectorSettings(
  settings: InspectorSettings = DEFAULT_INSPECTOR_SETTINGS,
): InspectorSettingsSource {
  return async () => settings;
}

/*
 * Секция канона. Блок кладётся в хеш ровно тогда, когда он есть в манифесте:
 * поколение без него хешируется как раньше, и инспектор, читающий старый
 * манифест, сходится с его config_hash. Порядок и разделители -- те же, что
 * у профилей: метка, NUL, имя ключа, NUL, значение, NUL.
 *
 * Список ключей прибит: новый ключ здесь -- новый канон, и инспекторы обязаны
 * узнать о нём раньше контроллера (docs/inspector-config-distribution.md).
 */
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

/**
 * Разбор блока из KV: `undefined` -- блока нет (старое поколение), `null` --
 * блок есть, но битый. Различать обязательно: отсутствие -- норма, мусор --
 * повод отвергнуть значение целиком.
 */
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
