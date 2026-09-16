import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/translations';

interface BlockActionsProps {
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDuplicate?: () => void;
  onDelete: () => void;
  duplicateLabel?: TranslationKey;
  deleteLabel: TranslationKey;
}

export function BlockActions({
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  duplicateLabel,
  deleteLabel,
}: BlockActionsProps) {
  const { t } = useI18n();

  return (
    <>
      <Tooltip title={t('builder.moveUp')}>
        <span>
          <IconButton
            disabled={onMoveUp === null}
            onClick={onMoveUp ?? undefined}
            aria-label={t('builder.moveUp')}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('builder.moveDown')}>
        <span>
          <IconButton
            disabled={onMoveDown === null}
            onClick={onMoveDown ?? undefined}
            aria-label={t('builder.moveDown')}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {onDuplicate !== undefined && duplicateLabel !== undefined && (
        <Tooltip title={t(duplicateLabel)}>
          <IconButton onClick={onDuplicate} aria-label={t(duplicateLabel)}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title={t(deleteLabel)}>
        <IconButton color="error" onClick={onDelete} aria-label={t(deleteLabel)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}
