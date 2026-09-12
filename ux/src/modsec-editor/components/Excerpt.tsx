import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useI18n } from '../i18n/useI18n';

const MONO = 'ui-monospace, Consolas, monospace';

interface ExcerptProps {
  /** Полное значение — сколько бы его ни было. */
  text: string;
  /**
   * Сколько символов остаётся на месте.
   *
   * Меру задаёт тот, кто отводит значению место: в подписи шага помещается
   * начало, в колонке значений — несколько строк.
   */
  limit: number;
  /** Заголовок окна: чьё это значение. */
  title: string;
}

/**
 * Значение, которое может оказаться длиной в экран: началом, а целиком — в
 * окне.
 *
 * Регулярка CRS или вставленная в пример полезная нагрузка длиннее всего
 * остального на порядок, и место они занимают не по своей важности:
 * колонка растягивается под самую длинную строку, и то, за чем смотрели на
 * этот блок, уезжает за его край. Обрезка возвращает разметке её
 * пропорции, а окно — возможность всё-таки прочитать значение целиком.
 *
 * Короткое значение остаётся простым текстом: щёлкать по нему незачем, и
 * ссылка сообщала бы о продолжении, которого нет.
 */
export function Excerpt({ text, limit, title }: ExcerptProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (text.length <= limit) return <>{text}</>;

  return (
    <>
      <Tooltip title={t('app.showFull')}>
        <Link
          component="button"
          type="button"
          variant="inherit"
          underline="hover"
          onClick={() => setOpen(true)}
          // Обрезанное значение остаётся собой, а не превращается в ссылку
          // рядом с собой: цвет и начертание те же, о продолжении говорит
          // подчёркивание по наведению.
          sx={{ font: 'inherit', color: 'inherit', verticalAlign: 'baseline', textAlign: 'left' }}
        >
          {text.slice(0, limit)}…
        </Link>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        {/* В заголовке — чьё значение показано: окно открывают из строки,
            в которую потом и возвращаются взглядом. */}
        <DialogTitle sx={{ fontFamily: MONO }}>{title}</DialogTitle>
        <DialogContent>
          {/* Моноширинный шрифт и разрыв в любом месте: значение читают
              посимвольно, и переносить его по словам не по чему. */}
          <Typography
            variant="body2"
            sx={{ fontFamily: MONO, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {text}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('app.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
