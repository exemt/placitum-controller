import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useI18n } from '../i18n/useI18n';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  /** Подпись подтверждающей кнопки — глагол, а не «ОК». */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Вопрос перед действием, которое стирает несохранённую работу.
 *
 * Подтверждающая кнопка называет само действие («Заменить»), а не отвечает
 * «ОК»: из заголовка окна можно выйти невнимательно, из глагола — сложнее.
 * Отмена стоит первой и получает фокус, чтобы Enter по привычке ничего
 * не разрушил.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2">{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onCancel}>
          {t('app.cancel')}
        </Button>
        <Button color="warning" variant="contained" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
