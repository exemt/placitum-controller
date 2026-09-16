import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SanitiseMatchedAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
