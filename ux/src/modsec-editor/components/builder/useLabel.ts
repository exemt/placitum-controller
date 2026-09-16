import { useCallback } from 'react';
import { useI18n } from '../../i18n/useI18n';
import type { Label } from '../../modsec/semantics';

export function useLabel(): (label: Label | null | undefined, fallback: string) => string {
  const { locale } = useI18n();
  return useCallback(
    (label: Label | null | undefined, fallback: string) => label?.[locale] ?? fallback,
    [locale],
  );
}
