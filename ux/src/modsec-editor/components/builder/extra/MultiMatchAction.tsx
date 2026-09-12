import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function MultiMatchAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
