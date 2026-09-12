import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useI18n } from '../../../i18n/useI18n';
import { serializeAction } from '../../../modsec/serialize';
import type { RuleAction } from '../../../modsec/types';

/**
 * Чип действия без поля в конструкторе.
 *
 * Правка — в текстовой вкладке: половинчатая форма потеряла бы то, чего не
 * поняла, при первой же соседней правке.
 */
export function ReadOnlyActionChip({ action }: { action: RuleAction }) {
  const { t } = useI18n();
  return (
    <Tooltip title={t('builder.readOnly')}>
      <Chip
        size="small"
        variant="outlined"
        label={serializeAction(action)}
        sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
      />
    </Tooltip>
  );
}
