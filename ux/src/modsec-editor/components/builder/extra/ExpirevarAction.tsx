import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function ExpirevarAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
