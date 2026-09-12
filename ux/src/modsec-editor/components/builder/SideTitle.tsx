import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

/**
 * Подпись стороны списка и черта под ней.
 *
 * Черта стоит между подписью и списком, а не между сторонами: подпись —
 * заголовок своего списка, и линия под ней говорит, где список начинается, а
 * не где кончился предыдущий. Поставленная в промежуток, она делила бы секцию
 * на две карточки, каждую со своим названием.
 *
 * Пунктиром и приглушённой по той же причине: сплошная линия во всю ширину
 * читается границей блока и уже занята — ею отделены друг от друга сами блоки
 * карточки ({@link Section}).
 */
export function SideTitle({ label, hint }: { label: string; hint?: string }) {
  const text = (
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  );

  return (
    <Stack spacing={0.5}>
      {hint === undefined ? (
        text
      ) : (
        <Tooltip title={hint}>
          {/* Подсказка ставится на обёртку, а не на сам текст: MUI подписывает
              ею элемент целиком, и заголовок читался бы вслух пояснением. */}
          <Box component="span" sx={{ alignSelf: 'flex-start' }}>
            {text}
          </Box>
        </Tooltip>
      )}

      <Divider sx={{ borderStyle: 'dashed', opacity: 0.6 }} />
    </Stack>
  );
}
