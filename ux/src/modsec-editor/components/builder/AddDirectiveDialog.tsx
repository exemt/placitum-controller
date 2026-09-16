import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChoiceField } from './ChoiceField';
import { DirectivePanel } from './DirectivePanel';
import { DirectiveValue } from './DirectiveRow';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { DIALOG_FIELD_TOP } from '../../theme';
import { directiveChoices } from '../../modsec/choices';
import { compileDocument } from '../../modsec/compile';
import {
  directiveMeta,
  emitDirective,
  isPanelArg,
  makeDirectiveForm,
} from '../../modsec/directives';
import { parseModsec } from '../../modsec/parser';
import type { DirectiveForm } from '../../modsec/directives';

const MONO = 'ui-monospace, Consolas, monospace';

interface AddDirectiveDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (line: string) => void;
}

export function AddDirectiveDialog({ open, onClose, onAdd }: AddDirectiveDialogProps) {
  const { t } = useI18n();
  const localize = useLabel();
  const [form, setForm] = useState<DirectiveForm | null>(null);

  const line = form === null ? '' : emitDirective(form);

  const ready = form !== null && compileDocument(parseModsec(line)).ok;

  const meta = form === null ? null : directiveMeta(form.name);
  const about =
    meta === null
      ? t('builder.addDirectiveHint')
      : `${localize(meta.label, form?.name ?? '')} — ${localize(meta.note, '')}`;

  const wide = form !== null && form.arg === 'actions';

  const close = () => {
    setForm(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={wide ? 'md' : 'sm'}>
      <DialogTitle>{t('builder.addDirective')}</DialogTitle>
      <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
        <Stack spacing={1.75}>
          <ChoiceField
            raw
            autoFocus
            label={t('builder.directive')}
            value={form?.name ?? ''}
            choices={directiveChoices(form?.name ?? '')}
            emptyLabel={t('builder.addDirectivePick')}
            onChange={(name) => setForm(name === '' ? null : makeDirectiveForm(name))}
          />

          <Typography variant="body2" color="text.secondary">
            {about}
          </Typography>

          {form !== null &&
            (isPanelArg(form.arg) ? (
              <DirectivePanel form={form} onChange={setForm} />
            ) : (
              <Stack direction="row">
                <DirectiveValue form={form} onChange={setForm} />
              </Stack>
            ))}

          {form !== null &&
            (ready ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {t('builder.addDirectiveLine')}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: MONO,
                    px: 0.75,
                    borderRadius: 0.5,
                    bgcolor: 'action.hover',
                    wordBreak: 'break-all',
                  }}
                >
                  {line}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="warning.main">
                {t('builder.addDirectiveIncomplete')}
              </Typography>
            ))}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>{t('app.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!ready}
          onClick={() => {
            onAdd(line);
            close();
          }}
        >
          {t('builder.addDirectiveAction')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
