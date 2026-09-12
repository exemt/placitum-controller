import { useCallback } from 'react';
import { useI18n } from '../../i18n/useI18n';
import type { Label } from '../../modsec/semantics';

/**
 * Локализует подписи из базы знаний ModSecurity (`semantics.ts`).
 *
 * Названия переменных, операторов и трансформаций хранятся рядом с их
 * метаданными, а не в словаре UI, поэтому им нужен отдельный «переводчик».
 * Для незнакомых ключевых слов возвращается исходное имя — конструктор
 * должен уметь показывать и то, чего он не знает.
 */
export function useLabel(): (label: Label | null | undefined, fallback: string) => string {
  const { locale } = useI18n();
  return useCallback(
    (label: Label | null | undefined, fallback: string) => label?.[locale] ?? fallback,
    [locale],
  );
}
