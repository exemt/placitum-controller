import { ReadOnlyActionChip } from './ReadOnlyActionChip';
import type { ExtraActionProps } from './types';

/** Неисключающий `ctl` — исключения уходят в свою секцию до этого списка. */
export function CtlAction({ action }: ExtraActionProps) {
  return <ReadOnlyActionChip action={action} />;
}
