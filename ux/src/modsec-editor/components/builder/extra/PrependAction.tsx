import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function PrependAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
