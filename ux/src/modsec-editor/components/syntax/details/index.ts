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
