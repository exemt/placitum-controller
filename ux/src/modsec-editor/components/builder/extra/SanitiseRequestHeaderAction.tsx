import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SanitiseRequestHeaderAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
