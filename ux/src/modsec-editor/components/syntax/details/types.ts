/**
 * Общая обвязка для файлов расширенных подсказок.
 *
 * Тексты хранятся парами en/ru прямо в коде, поэтому важно, чтобы запись пары
 * не съедала строку целиком: `l('...', '...')` вместо объектного литерала.
 */

import type { KeywordDetails } from '../modsecKeywords';
import type { LocalizedText } from '../modsecKeywords';

/** Пара «английский, русский». */
export const l = (en: string, ru: string): LocalizedText => ({ en, ru });

/** Расширенные подсказки одной категории, ключ — каноничное имя. */
export type DetailsMap = Record<string, KeywordDetails>;
