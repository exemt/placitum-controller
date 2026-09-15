import type { KeywordDetails } from '../modsecKeywords';
import type { LocalizedText } from '../modsecKeywords';

export const l = (en: string, ru: string): LocalizedText => ({ en, ru });

export type DetailsMap = Record<string, KeywordDetails>;
