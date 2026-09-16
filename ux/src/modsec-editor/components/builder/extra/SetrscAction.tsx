import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function SetrscAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
