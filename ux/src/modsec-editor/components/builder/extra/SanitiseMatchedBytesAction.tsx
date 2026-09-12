import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SanitiseMatchedBytesAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
