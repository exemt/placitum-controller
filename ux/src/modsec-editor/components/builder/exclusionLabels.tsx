import BlockIcon from '@mui/icons-material/Block';
import EditOffOutlinedIcon from '@mui/icons-material/EditOffOutlined';
import type { ReactElement } from 'react';
import type { TranslationKey } from '../../i18n/translations';
import type { ExclusionOp } from '../../modsec/exclusions';

/**
 * Чем исключение называет себя и каким значком отмечается.
 *
 * Отдельно от компонентов, потому что спрашивают об этом и строка списка
 * блоков, и панель действий, и подписи должны быть одни и те же: исключение,
 * названное в одном месте «снимает правило», а в другом «выключает», читается
 * как два разных механизма.
 */
const OP_LABEL: Record<ExclusionOp, TranslationKey> = {
  remove: 'builder.exclusionOpRemove',
  removeTarget: 'builder.exclusionOpRemoveTarget',
  updateTarget: 'builder.exclusionOpUpdateTarget',
  updateAction: 'builder.exclusionOpUpdateAction',
};

/** Чем директива исключения называет себя в списке блоков. */
export function exclusionOpKey(op: ExclusionOp): TranslationKey {
  return OP_LABEL[op];
}

/**
 * Значок исключения: снятие и правка — разные вещи.
 *
 * Снятое правило не работает вовсе, у поправленного меняется одна цель или
 * реакция; отличить это в списке из тысячи строк надо раньше, чем дочитаешь
 * саму директиву.
 */
export function effectIcon(removed: boolean): ReactElement {
  return removed ? <BlockIcon /> : <EditOffOutlinedIcon />;
}

/** Значок директивы исключения: снимает она правило целиком или правит. */
export function exclusionIcon(op: ExclusionOp): ReactElement {
  return effectIcon(op === 'remove');
}
