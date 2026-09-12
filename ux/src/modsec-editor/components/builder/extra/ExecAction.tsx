import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function ExecAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
