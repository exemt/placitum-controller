import BlockIcon from '@mui/icons-material/Block';
import EditOffOutlinedIcon from '@mui/icons-material/EditOffOutlined';
import type { ReactElement } from 'react';
import type { TranslationKey } from '../../i18n/translations';
import type { ExclusionOp } from '../../modsec/exclusions';

const OP_LABEL: Record<ExclusionOp, TranslationKey> = {
  remove: 'builder.exclusionOpRemove',
  removeTarget: 'builder.exclusionOpRemoveTarget',
  updateTarget: 'builder.exclusionOpUpdateTarget',
  updateAction: 'builder.exclusionOpUpdateAction',
};

export function exclusionOpKey(op: ExclusionOp): TranslationKey {
  return OP_LABEL[op];
}

export function effectIcon(removed: boolean): ReactElement {
  return removed ? <BlockIcon /> : <EditOffOutlinedIcon />;
}

export function exclusionIcon(op: ExclusionOp): ReactElement {
  return effectIcon(op === 'remove');
}
