import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function InitcolAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
