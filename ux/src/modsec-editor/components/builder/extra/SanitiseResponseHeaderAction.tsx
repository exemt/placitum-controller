import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SanitiseResponseHeaderAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
