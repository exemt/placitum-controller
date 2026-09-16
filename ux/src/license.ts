import type { Locale } from "./i18n/locale.ts";
import en from "../help/license.md?raw";
import ru from "../help/license.ru.md?raw";

export const LICENSE_VERSION = /^Version\s+(\S+)/m.exec(en)?.[1] ?? "0";

export function licenseText(locale: Locale): string {
  return locale === "en" ? en : ru;
}

export type LicenseAcceptance = {
  version: string;
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

export function writeAcceptance(): LicenseAcceptance {
  const row: LicenseAcceptance = {
    version: LICENSE_VERSION,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(row));
  } catch {
  }
  return row;
}

export function isCurrent(row: LicenseAcceptance | null): boolean {
  return row !== null && row.version === LICENSE_VERSION;
}
