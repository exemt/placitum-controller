import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

export function XmlnsAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
