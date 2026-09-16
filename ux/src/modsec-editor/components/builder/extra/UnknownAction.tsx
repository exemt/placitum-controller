import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function UnknownAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
