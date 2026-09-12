import type { Locale } from "./i18n/locale.ts";
import en from "../help/license.md?raw";
import ru from "../help/license.ru.md?raw";

/**
 * Лицензионное соглашение: текст, его версия и отметка о принятии.
 *
 * Оригинал текста -- `LICENSE.md` (английский, юридически главный) и
 * `LICENSE.ru.md` (перевод) в корне репозитория; в `ux/help/` лежат их копии,
 * которые держит равными `scripts/license-sync.mjs` (см. там, почему копии).
 * Текст едет в бандл, а не запрашивается у API: окно согласия стоит на входе,
 * и вход не должен зависеть от контроллера.
 *
 * Версия читается из самого текста -- строки «Version X.Y …» английского
 * оригинала, а не дублируется константой: иначе правка соглашения без правки
 * константы оставила бы всех на старом согласии.
 */

export const LICENSE_VERSION = /^Version\s+(\S+)/m.exec(en)?.[1] ?? "0";

export function licenseText(locale: Locale): string {
  return locale === "en" ? en : ru;
}

/** Что и когда приняли в этом браузере. */
export type LicenseAcceptance = {
  version: string;
  /** ISO-время нажатия «Принять». */
  at: string;
};

const KEY = "waf.license";

export function readAcceptance(): LicenseAcceptance | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const { version, at } = parsed as Record<string, unknown>;
    return typeof version === "string" && typeof at === "string"
      ? { version, at }
      : null;
  } catch {
    return null;
  }
}

/**
 * Записать принятие текущей версии. Если хранилище недоступно (приватный
 * режим, запрет данных сайта), окно вернётся при следующем входе -- это
 * честнее, чем считать соглашение принятым молча.
 */
export function writeAcceptance(): LicenseAcceptance {
  const row: LicenseAcceptance = {
    version: LICENSE_VERSION,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(row));
  } catch {
    // см. выше
  }
  return row;
}

/** Принята ли именно та версия, что едет с этой сборкой. */
export function isCurrent(row: LicenseAcceptance | null): boolean {
  return row !== null && row.version === LICENSE_VERSION;
}
