import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SetuidAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
