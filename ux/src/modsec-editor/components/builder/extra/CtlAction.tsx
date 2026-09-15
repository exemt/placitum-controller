import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function CtlAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
