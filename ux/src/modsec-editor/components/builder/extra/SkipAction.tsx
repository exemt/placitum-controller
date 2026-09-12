import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SkipAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
