import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function AppendAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
