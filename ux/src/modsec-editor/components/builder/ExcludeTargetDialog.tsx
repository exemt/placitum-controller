import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ParamList } from './ParamList';
import { SuggestField } from './SuggestField';
import { useI18n } from '../../i18n/useI18n';
import { DIALOG_FIELD_TOP } from '../../theme';
import { excludeTargetLine } from '../../modsec/exclusions';
import { selectorSupport } from '../../modsec/semantics';
import { VARIABLE_SUGGESTIONS, selectorSuggestions } from '../../modsec/suggestions';
import type { ParamMode } from './ParamList';

interface ExcludeTargetDialogProps {
  open: boolean;
  onClose: () => void;
  id: string;
  onAppend: (line: string) => void;
}

export function ExcludeTargetDialog({ open, onClose, id, onAppend }: ExcludeTargetDialogProps) {
  const { t } = useI18n();

  const [scope, setScope] = useState('ARGS');
  const [mode, setMode] = useState<ParamMode>('all');
  const [params, setParams] = useState<string[]>([]);

  const support = selectorSupport(scope);
  const modes: ParamMode[] = support === 'required' ? ['only'] : ['all', 'only'];

  const incomplete = mode !== 'all' && params.length === 0;

  const close = () => {
    setScope('ARGS');
    setMode('all');
    setParams([]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{t('builder.excludeTargetTitle', { id })}</DialogTitle>
      <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
        <Stack spacing={1.75}>
          <Typography variant="body2" color="text.secondary">
            {t('builder.excludeTargetHint', { id })}
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
          >
            <Box sx={{ width: 190 }}>
              <SuggestField
                required
                label={t('builder.exclusionTargetScope')}
                suggestions={VARIABLE_SUGGESTIONS}
                value={scope}
                onCommit={(next) => {
                  const nextSupport = selectorSupport(next);
                  setScope(next);
                  if (nextSupport === 'none') setParams([]);
                  if (nextSupport !== 'optional') {
                    setMode(nextSupport === 'required' ? 'only' : 'all');
                  }
                }}
                inputSx={{ color: 'warning.light', fontWeight: 500 }}
              />
            </Box>

            {support !== 'none' && (
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <ParamList
                  mode={mode}
                  values={params}
                  modes={modes}
                  note={t('builder.excludeTargetNoExcept')}
                  allNote={t('builder.excludeTargetAllHint')}
                  requiredNote={t('builder.excludeTargetParamRequired')}
                  suggestions={selectorSuggestions(scope)}
                  onChange={(next) => {
                    setMode(next.mode);
                    setParams(next.values);
                  }}
                />
              </Box>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>{t('app.cancel')}</Button>
        <Button
          variant="contained"
          disabled={scope === '' || incomplete}
          onClick={() => {
            onAppend(excludeTargetLine(id, scope, mode === 'only' ? params : []));
            close();
          }}
        >
          {t('builder.excludeTarget')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
