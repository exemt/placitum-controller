import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SetenvAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
