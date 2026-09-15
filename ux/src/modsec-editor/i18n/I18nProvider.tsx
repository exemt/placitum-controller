import { useCallback, useMemo, type ReactNode } from 'react';
import {
  LOCALES,
  translations,
  type Locale,
  type TranslationKey,
} from './translations';
import { I18nContext, type I18nContextValue } from './context';

interface I18nProviderProps {
  children: ReactNode;
  locale: Locale;
}

export function I18nProvider({ children, locale }: I18nProviderProps) {
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>) => {
      const template = translations[locale][key] ?? translations.en[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
    },
    [locale],
  );

  const setLocale = useCallback(() => {}, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
