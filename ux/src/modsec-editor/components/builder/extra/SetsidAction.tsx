import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SetsidAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
