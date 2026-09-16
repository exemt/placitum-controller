import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function DeprecatevarAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
