import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CHEVRON_COLUMN, TITLE_COLUMN } from './layout';
import { useI18n } from '../../i18n/useI18n';
import { BLOCK_ROW } from '../../theme';

/**
 * Внутреннее поле блока — то же, что у шапки карточки.
 *
 * Значение нужно не только самому блоку: панель, которая занимает карточку
 * целиком и обходится без заголовка, обязана отступать на столько же.
 */
export const SECTION_PADDING = 1.5;

interface SectionProps {
  title: string;
  /**
   * Строка о содержимом: она видна, пока блок свёрнут. Свёрнутый блок не
   * должен превращаться в закрытую дверь — по этой строке решают, разворачивать
   * его или пролистнуть.
   */
  summary?: string;
  /** Выжимка — часть правила, а не проза: её сверяют с текстом файла глазами. */
  monospace?: boolean;
  /**
   * Счётчики у самого правого края: сколько внутри и сколько об этом сказано.
   *
   * Правее кнопок блока намеренно. Счётчик — это про содержимое, и у всех
   * блоков он стоит в одной колонке; кнопка есть не у каждого, и поставленная
   * за счётчиком она сдвигала бы эту колонку от блока к блоку.
   */
  counters?: ReactNode;
  /**
   * Кнопки на полосе — то, что делают с блоком, не открывая его.
   *
   * Стоят вне нажимаемого заголовка: кнопка внутри кнопки — ни разметка, ни
   * поведение, и нажатие на неё сворачивало бы блок заодно.
   */
  actions?: ReactNode;
  /**
   * Развёрнут ли блок при появлении карточки.
   *
   * По умолчанию нет: карточка раскрывается на один блок, а остальные ждут,
   * пока о них спросят. Иначе одно правило занимает экран целиком — и то, что
   * человек открыл, приходится искать в нём прокруткой.
   */
  defaultExpanded?: boolean;
  children: ReactNode;
}

/**
 * Сворачиваемый блок карточки: условия, действия, замечания.
 *
 * Блоки собраны в один компонент, потому что свёрнутыми они обязаны выглядеть
 * одинаково. Карточка — таблица, а не набор панелей: полоса блока повторяет
 * шапку правила по высоте и по колонкам — раскрывашка, название, строка о
 * содержимом, счётчики у правого края. Тогда свёрнутая карточка читается
 * сверху вниз одним движением, а не тремя разными способами.
 *
 * Раскрывашка стоит слева — там же, где у самой карточки. Справа она уезжала
 * бы вслед за шириной окна, а колонка значков должна быть одна на все уровни.
 *
 * Заголовок нажимается целиком: полоса шириной во всю карточку — цель, в
 * которую не надо попадать. Кнопки блока и счётчики, если они есть, стоят
 * правее этой цели: то, что делают с содержимым, не должно требовать его
 * открыть.
 *
 * Черта сверху есть у каждого блока — она же отделяет первый из них от шапки
 * карточки, — и вторая появляется у раскрытого, между его полосой и полями.
 * Так конец содержимого всегда упирается либо в полосу следующего блока, либо
 * в рамку карточки, и ни одна линия не удваивается.
 *
 * Свёрнутый блок отпускает содержимое, а не прячет его. Поля конструктора
 * дороги, и спрятанное правило стоит столько же, сколько показанное, — то же
 * решение, что у карточки и у списка блоков.
 */
export function Section({
  title,
  summary,
  monospace,
  counters,
  actions,
  defaultExpanded = false,
  children,
}: SectionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', height: BLOCK_ROW }}>
        <ButtonBase
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'builder.collapseSection' : 'builder.expandSection', {
            name: title,
          })}
          sx={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            pl: SECTION_PADDING,
            // Справа заголовок упирается либо в край карточки, либо в полосу
            // кнопок со счётчиками: во втором случае поле блока принадлежит ей.
            pr: actions === undefined && counters === undefined ? SECTION_PADDING : 1,
            gap: 1,
            // Заголовок — кнопка, а кнопка центрирует текст: без этого выжимка
            // о содержимом висела бы посередине полосы, оторванная от названия.
            textAlign: 'left',
            // Скругление здесь лишнее: полоса идёт от края до края карточки,
            // и её углы — это углы самой карточки.
            borderRadius: 0,
          }}
        >
          <Box
            sx={{
              width: CHEVRON_COLUMN,
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </Box>

          <Typography variant="subtitle2" noWrap sx={{ width: TITLE_COLUMN, flexShrink: 0 }}>
            {title}
          </Typography>

          {expanded || summary === undefined ? (
            <Box sx={{ flex: 1 }} />
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{
                flex: 1,
                minWidth: 0,
                fontFamily: monospace ? 'ui-monospace, Consolas, monospace' : undefined,
              }}
            >
              {summary}
            </Typography>
          )}

        </ButtonBase>

        {(actions !== undefined || counters !== undefined) && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexShrink: 0, pr: SECTION_PADDING }}
          >
            {actions !== undefined && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                {actions}
              </Stack>
            )}

            {counters !== undefined && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                {counters}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>

      <Collapse in={expanded} unmountOnExit>
        <Box
          sx={{
            p: SECTION_PADDING,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
