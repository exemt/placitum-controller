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
  dialogTitle: string;
  regex?: boolean;
  suggestions?: Suggestion[];
  actions?: ReactNode;
  monospace?: boolean;
  fullWidth?: boolean;
  sx?: Record<string, unknown>;
}

function useRegexReview(pattern: string, enabled: boolean): RegexReview | null {
  return useMemo(
    () => (enabled && pattern !== '' ? reviewRegex(pattern) : null),
    [enabled, pattern],
  );
}

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
