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
  text: string;
  limit: number;
  title: string;
}

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
          sx={{ font: 'inherit', color: 'inherit', verticalAlign: 'baseline', textAlign: 'left' }}
        >
          {text.slice(0, limit)}…
        </Link>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontFamily: MONO }}>{title}</DialogTitle>
        <DialogContent>
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
