import type { RuleAction } from '../../../modsec/types';

/** Одно «прочее» действие — сейчас только для чтения, позже своя форма. */
export interface ExtraActionProps {
  action: RuleAction;
}
