import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/translations';

interface BlockActionsProps {
  /** `null`, когда двигать некуда: блок уже первый или последний в файле. */
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  /** `undefined` — копировать нечего или незачем. */
  onDuplicate?: () => void;
  onDelete: () => void;
  /** Чем названы копия и удаление: у правила и у строки это разные вещи. */
  duplicateLabel?: TranslationKey;
  deleteLabel: TranslationKey;
}

/**
 * Хвост полосы блока: переставить, скопировать, удалить.
 *
 * Набор один на все блоки конструктора — правило, безусловное действие,
 * метку, директиву. Собран в одном месте не ради экономии строк: кнопки стоят
 * у правого края, ищут их по месту, и порядок обязан быть одним и тем же у
 * любой полосы, иначе корзина оказывается там, где у соседа стрелка.
 *
 * Переставлять можно всё, потому что порядок строк в файле — не оформление:
 * `SecRuleRemoveById` действует только ниже своей цели, `skipAfter` — только
 * выше своей метки, а `SecRuleEngine DetectionOnly` меняет смысл каждого
 * `deny` после себя. Кнопка гаснет только у крайних блоков файла.
 */
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
      {/* Погашенная кнопка не отдаёт события, и подсказку над ней держит
          обёртка: без неё «двигать некуда» осталось бы без объяснения. */}
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
