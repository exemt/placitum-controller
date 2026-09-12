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
  /**
   * Язык редактора.
   *
   * Приходит снаружи и только снаружи: язык выбирают в панели, и редактор
   * говорит на нём же. Своего переключателя, своей записи в хранилище и
   * своего `lang` у документа у редактора поэтому нет -- всё это уже есть у
   * панели, и второй экземпляр расходился бы с первым.
   */
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

  // `setLocale` остался в контракте контекста: сменить язык изнутри
  // редактора некуда, поэтому он ничего не делает.
  const setLocale = useCallback(() => {}, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
