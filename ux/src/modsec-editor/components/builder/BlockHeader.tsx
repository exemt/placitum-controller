import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CHEVRON_COLUMN, TITLE_COLUMN } from './layout';
import { useI18n } from '../../i18n/useI18n';
import { BLOCK_ROW } from '../../theme';
import type { ReactNode } from 'react';
import type { TranslationKey } from '../../i18n/translations';

const MONO = 'ui-monospace, Consolas, monospace';

/** Раскрывашка блока: как подписана и что делает. */
interface BlockToggle {
  expanded: boolean;
  onToggle: () => void;
  /**
   * Чем названо действие: у правила сворачивают правило, у директивы — блок.
   * Разряд строки человек и так видит, а вот подсказка «Свернуть блок» над
   * карточкой правила заставляет гадать, что именно свернётся.
   */
  collapseLabel: TranslationKey;
  expandLabel: TranslationKey;
}

interface BlockHeaderProps {
  /** `null` — блок не раскрывается: метка, однострочная директива. */
  toggle: BlockToggle | null;
  /** Колонка названия: чем блок зовётся — {@link BlockTitle}. */
  title: ReactNode;
  /** Колонка содержимого: то, что в строке написано. */
  children: ReactNode;
  /** Отметки перед кнопками: то, чего в самой строке не видно. */
  marks?: ReactNode;
  /** Хвост полосы — {@link BlockActions}. */
  actions: ReactNode;
}

/**
 * Полоса блока верхнего уровня: правила, безусловного действия, директивы,
 * метки.
 *
 * Собрана в один компонент по той же причине, по которой собраны блоки внутри
 * карточки ({@link Section}): список блоков — таблица, а не набор карточек со
 * своим оформлением у каждой. Колонок пять — раскрывашка, название,
 * содержимое, отметки, кнопки, — и у всех четырёх разрядов строки они одни и
 * те же. Колонка, которой у разряда нет, остаётся за ним пустой: убери её у
 * метки, и название уедет влево от имён соседних директив.
 *
 * Полоса залита у всех, а не только у раскрывающихся. Заливка говорит не
 * «здесь можно нажать», а «здесь начинается блок»: строка в один ряд — тот же
 * блок файла, что и правило на двадцать полей, переставляется и удаляется она
 * теми же кнопками, и выглядеть посреди списка чужой ей незачем.
 *
 * Высота задана числом: по ней виртуализированный список считает распорки, а
 * знать высоту свёрнутого блока ему нужно до того, как тот нарисуется.
 */
export function BlockHeader({ toggle, title, children, marks, actions }: BlockHeaderProps) {
  const { t } = useI18n();
  const label =
    toggle === null ? '' : t(toggle.expanded ? toggle.collapseLabel : toggle.expandLabel);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        height: BLOCK_ROW,
        px: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      {toggle === null ? (
        <Box sx={{ width: CHEVRON_COLUMN, flexShrink: 0 }} />
      ) : (
        <Tooltip title={label}>
          <IconButton
            size="small"
            onClick={toggle.onToggle}
            aria-label={label}
            aria-expanded={toggle.expanded}
          >
            {toggle.expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}

      <Box
        sx={{
          width: TITLE_COLUMN,
          flexShrink: 0,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {title}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>

      {marks}
      {actions}
    </Stack>
  );
}

/**
 * Название блока в полосе.
 *
 * Моноширинное там, где показано написание из файла — имя директивы, — и
 * обычное там, где название придумал редактор: «Правило 942100», «Метка».
 * Различие не декоративное: по нему видно, что можно искать в текстовой
 * вкладке дословно, а что придётся переводить обратно самому.
 *
 * Пояснение живёт подсказкой и здесь же: колонка отдана самому названию
 * целиком — иначе длинные имена обрывались бы ради подписи, которую и так
 * читают раз, — а показывают её у всех разрядов одинаково.
 */
export function BlockTitle({
  monospace = false,
  hint,
  children,
}: {
  monospace?: boolean;
  /** Что это за блок и что он делает; пусто — сказано самим названием. */
  hint?: string;
  children: ReactNode;
}) {
  const text = (
    <Typography
      variant="body2"
      noWrap
      sx={{
        minWidth: 0,
        fontWeight: 500,
        fontFamily: monospace ? MONO : undefined,
      }}
    >
      {children}
    </Typography>
  );

  if (hint === undefined || hint === '') return text;

  return (
    <Tooltip describeChild title={hint} placement="top-start" enterDelay={600}>
      {text}
    </Tooltip>
  );
}
