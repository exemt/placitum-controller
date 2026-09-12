import { useMemo, useState, type ReactNode } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { SuggestField } from './SuggestField';
import { CollapsibleAlert } from '../CollapsibleAlert';
import { useI18n } from '../../i18n/useI18n';
import { DIALOG_FIELD_TOP } from '../../theme';
import { reviewRegex } from '../../modsec/regex';
import type { RegexReview } from '../../modsec/regex';
import type { Suggestion } from '../../modsec/suggestions';

interface LongTextFieldProps {
  label?: string;
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Заголовок окна редактирования. */
  dialogTitle: string;
  /** Проверять значение как регулярное выражение. */
  regex?: boolean;
  /** Готовые варианты значения; пустой список оставляет поле обычным. */
  suggestions?: Suggestion[];
  /**
   * Кнопки слева от карандаша — внутри той же обоймы.
   *
   * Карандаш уводит правку в окно и потому замыкает ряд. Сосед слева — про
   * значение, а не про выход из поля: отметка переменной у сырого `setvar`.
   */
  actions?: ReactNode;
  monospace?: boolean;
  fullWidth?: boolean;
  sx?: Record<string, unknown>;
}

/** Разбор шаблона или `null`, когда проверять нечего. */
function useRegexReview(pattern: string, enabled: boolean): RegexReview | null {
  return useMemo(
    () => (enabled && pattern !== '' ? reviewRegex(pattern) : null),
    [enabled, pattern],
  );
}

/**
 * Однострочное поле с кнопкой «развернуть» — тем же значением, но в окне.
 *
 * Значения операторов бывают длиной в экран: регулярка CRS на сотню
 * символов не помещается в колонку и правится вслепую. Карандаш открывает
 * то же значение многострочным моноширинным блоком, а для `@rx` ещё и
 * проверяет выражение до того, как оно уедет в текст правила.
 *
 * Длинное значение и готовый вариант не спорят друг с другом: список
 * подсказок даёт начать с типового значения, окно — дописать его до
 * нужного.
 *
 * Шаблон проверяется и у закрытого окна. Сломанное выражение — это то, о
 * чём надо знать сразу: искать его, открывая по очереди каждое условие,
 * никто не станет, поэтому краснеет само поле, а разбираться с причиной
 * человек идёт уже внутрь.
 */
export function LongTextField({
  label,
  value,
  onCommit,
  placeholder,
  disabled = false,
  dialogTitle,
  regex = false,
  suggestions = [],
  actions,
  monospace = false,
  fullWidth,
  sx,
}: LongTextFieldProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);

  const open = draft !== null;
  const review = useRegexReview(value, regex);
  const editing = useRegexReview(draft ?? '', open && regex);

  /** Шаблон не собрался — это ошибка, и правило с ней не заработает. */
  const broken = (checked: RegexReview | null) =>
    checked === null || checked.regex !== null || checked.unsupported !== null
      ? null
      : t('builder.regexInvalid', { reason: checked.reason ?? '' });

  const failure = broken(editing);

  const save = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  return (
    <>
      <SuggestField
        label={label}
        value={value}
        onCommit={onCommit}
        suggestions={suggestions}
        placeholder={placeholder}
        disabled={disabled}
        monospace={monospace}
        fullWidth={fullWidth}
        error={broken(review) ?? undefined}
        sx={sx}
        endAdornment={
          <InputAdornment position="end">
            {actions}
            <Tooltip title={t('builder.editInWindow')}>
              <span>
                <IconButton
                  aria-label={t('builder.editInWindow')}
                  disabled={disabled}
                  onClick={() => setDraft(value)}
                >
                  <EditOutlinedIcon />
                </IconButton>
              </span>
            </Tooltip>
          </InputAdornment>
        }
      />

      <Dialog open={open} onClose={() => setDraft(null)} fullWidth maxWidth="md">
        <DialogTitle>{dialogTitle}</DialogTitle>
        {/* Отступ повторяет собственный селектор MUI: правило «под заголовком
            отступа нет» весит два класса и обычному `sx` не уступает. */}
        <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
          <Stack spacing={1}>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={6}
              maxRows={20}
              margin="dense"
              label={label ?? dialogTitle}
              value={draft ?? ''}
              error={failure !== null}
              helperText={regex ? t('builder.regexHint') : ' '}
              onChange={(event) => setDraft(event.target.value)}
              slotProps={{
                input: { sx: { fontFamily: 'ui-monospace, Consolas, monospace' } },
              }}
            />

            {failure !== null && (
              <CollapsibleAlert
                severity="error"
                summary={failure}
                detail={editing?.detail}
              />
            )}

            {/* Записи PCRE — не ошибка: правило с ними работает, и знать
                о них стоит только затем, чтобы не искать в шаблоне
                несуществующую поломку. */}
            {editing !== null && editing.unsupported !== null && (
              <CollapsibleAlert
                severity="info"
                summary={t('builder.regexUnsupported', { what: editing.unsupported })}
              />
            )}
            {editing !== null && editing.unsupported === null && editing.rewrites.length > 0 && (
              <CollapsibleAlert severity="info" summary={t('builder.regexPcre')} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>{t('app.cancel')}</Button>
          <Button variant="contained" disabled={failure !== null} onClick={save}>
            {t('app.apply')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
