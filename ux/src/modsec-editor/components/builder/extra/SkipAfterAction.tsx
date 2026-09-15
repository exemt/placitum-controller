import { MarkerPreview } from '../../MarkerPreview';
import { serializeAction } from '../../../modsec/serialize';
import type { ExtraActionProps } from './types';

export function SkipAfterAction({ action }: ExtraActionProps) {
  const label = action.value ?? '';
  return (
    <MarkerPreview
      label={label}
      caption={serializeAction(action)}
      chipSx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
    />
  );
}
