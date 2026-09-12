/**
 * Расширенные подсказки: второй уровень справки, который редактор раскрывает
 * по Alt.
 *
 * Разложены по категориям в отдельные файлы — их читают и правят людьми,
 * а не генерируют, поэтому размер одного файла важнее красоты сборки.
 * Ключ — каноничное имя ключевого слова, то же самое, что в `modsecKeywords.ts`.
 */

import type { KeywordDetails } from '../modsecKeywords';
import { DIRECTIVE_DETAILS } from './directives';
import { ACTION_DETAILS } from './actions';
import { TRANSFORM_DETAILS } from './transforms';
import { OPERATOR_DETAILS } from './operators';
import { VARIABLE_DETAILS } from './variables';

export const KEYWORD_DETAILS: Record<string, KeywordDetails> = {
  ...DIRECTIVE_DETAILS,
  ...ACTION_DETAILS,
  ...TRANSFORM_DETAILS,
  ...OPERATOR_DETAILS,
  ...VARIABLE_DETAILS,
};
