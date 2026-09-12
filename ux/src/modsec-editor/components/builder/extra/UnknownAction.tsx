import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

/** Имя, которого нет в реестре — опечатка или действие без своего потока. */
export function UnknownAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
