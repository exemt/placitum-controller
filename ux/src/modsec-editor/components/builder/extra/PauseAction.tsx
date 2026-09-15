import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function PauseAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
