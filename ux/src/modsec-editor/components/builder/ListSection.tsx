import { Children } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { lighten } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { FIELD_GUTTER, LIST_PADDING } from '../../theme';

/**
 * Чем раздел приходится текущему значению.
 *
 * Цвет заголовка отвечает на этот вопрос раньше, чем прочитан сам
 * заголовок: зелёный — здесь это и ставят, оранжевый — к этому значению не
 * подойдёт, серый — просто ещё один раздел базы знаний.
 */
export type SectionTone = 'fit' | 'plain' | 'unfit';

const TONE_COLOR: Record<SectionTone, string> = {
  fit: 'success.main',
  plain: 'text.secondary',
  unfit: 'warning.main',
};

interface ListSectionProps {
  /** Заголовок раздела — уже на языке интерфейса. */
  title: string;
  tone?: SectionTone;
  /** Строки раздела: то, что список отдал в `renderGroup`. */
  children: ReactNode;
}

/**
 * Заголовок раздела в выпадающем списке.
 *
 * Списки конструктора длинные и разбиты на разделы, а стандартный
 * заголовок — такая же серая строка, как пояснение под вариантом: границы
 * разделов в нём не видно, и список читается сплошной лентой. Здесь
 * заголовок вынесен в отдельную полосу — точка цвета раздела, набранное
 * прописными название, черта до правого края и число вариантов, — и она
 * прилипает к верху при прокрутке: видно, в каком разделе сейчас идёт
 * выбор, даже когда его начало уже уехало.
 */
export function ListSection({ title, tone = 'plain', children }: ListSectionProps) {
  const color = TONE_COLOR[tone];

  return (
    <Box
      component="li"
      sx={{
        // Первый раздел верхней чертой не отделяется: отделять его не от
        // чего, а черта у самого края панели читается как обрезанная строка.
        '&:first-of-type > .ListSection-head': { borderTopColor: 'transparent' },
      }}
    >
      <Box
        className="ListSection-head"
        sx={{
          position: 'sticky',
          top: -LIST_PADDING,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: `${FIELD_GUTTER}px`,
          py: 0.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          // Заливка обязана быть непрозрачной: полоса прилипшая, и сквозь
          // неё просвечивали бы проезжающие снизу строки.
          bgcolor: (theme) => lighten(theme.palette.background.paper, 0.05),
        }}
      >
        <Box sx={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', bgcolor: color }} />

        <Typography
          variant="caption"
          noWrap
          sx={{
            color,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Typography>

        {/* Черта доводит заголовок до правого края панели: без неё короткое
            название висит в пустоте и полосой не выглядит. */}
        <Box sx={{ flex: 1, minWidth: 8, height: '1px', bgcolor: 'divider' }} />

        <Typography variant="caption" sx={{ flexShrink: 0, fontSize: 10.5, color: 'text.disabled' }}>
          {Children.count(children)}
        </Typography>
      </Box>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {children}
      </Box>
    </Box>
  );
}
