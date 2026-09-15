import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SanitiseArgAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
