import { useCallback, useEffect, type ReactNode } from "react";

import { useAppSelector } from "../store/hooks.ts";
import { en } from "./en.ts";
import type { Locale } from "./locale.ts";
import { ru } from "./ru.ts";

export type { Locale } from "./locale.ts";

const catalogs = { ru, en } as const;

function lookup(locale: Locale, path: string): string {
  const parts = path.split(".");
  let cur: unknown = catalogs[locale];
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) {
      return path;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : path;
}

export type Translate = (
  path: string,
  vars?: Record<string, string | number>,
) => string;

export function translate(
  locale: Locale,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const raw = lookup(locale, path);
  if (vars === undefined) {
    return raw;
  }
  return raw.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key] ?? `{${key}}`),
  );
}

export function useT(): Translate {
  const locale = useAppSelector((s) => s.ui.locale);
  return useCallback(
    (path, vars) => translate(locale, path, vars),
    [locale],
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useAppSelector((s) => s.ui.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return children;
}
