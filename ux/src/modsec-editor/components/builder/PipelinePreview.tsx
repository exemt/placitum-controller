import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Excerpt } from '../Excerpt';
import { useI18n } from '../../i18n/useI18n';
import { matchValue } from '../../modsec/match';
import { sampleValueHint } from '../../modsec/suggestions';
import { runPipeline, showBytes, toBytes } from '../../modsec/transform';
import type { MatchVerdict } from '../../modsec/match';
import type { VisualOperator, VisualTarget } from '../../modsec/model';

const MONO = 'ui-monospace, Consolas, monospace';

interface PipelinePreviewProps {
  transforms: string[];
  operator: VisualOperator;
  targets: VisualTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PipelinePreview({
  transforms,
  operator,
  targets,
  open,
  onOpenChange,
}: PipelinePreviewProps) {
  const { t } = useI18n();
  const [sample, setSample] = useState('');

  const empty = transforms.length === 0;

  const input = useMemo(() => toBytes(sample), [sample]);
  const steps = useMemo(() => runPipeline(input, transforms), [input, transforms]);
  const output = steps.length === 0 ? input : steps[steps.length - 1].value;
  const verdict: MatchVerdict | null =
    output === null ? null : matchValue(operator, output);

  if (!open) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<ExpandMoreIcon />}
          onClick={() => onOpenChange(true)}
          sx={{ color: 'text.secondary', fontWeight: 400 }}
        >
          {t('builder.previewOpen')}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        p: 2,
        pr: 5,
        borderRadius: 1,
        bgcolor: 'background.default',
        border: 1,
        borderColor: empty ? 'error.main' : 'transparent',
      }}
    >
      <Tooltip title={t('builder.previewClose')}>
        <IconButton
          size="small"
          onClick={() => onOpenChange(false)}
          sx={{ position: 'absolute', top: 4, right: 4, color: 'text.disabled' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Stack spacing={1.25}>
        {empty && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <ErrorOutlineIcon fontSize="small" color="error" />
            <Typography variant="body2">{t('builder.previewNoTransforms')}</Typography>
          </Stack>
        )}

        <TextField
          size="small"
          fullWidth
          autoFocus
          label={t('builder.previewSample')}
          helperText={sample === '' ? t('builder.previewHint') : undefined}
          placeholder={sampleValueHint(operator, targets)}
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { autoComplete: 'off', spellCheck: false },
            input: { sx: { fontFamily: MONO } },
          }}
          sx={{ maxWidth: 560 }}
        />

        {!empty && sample !== '' && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
              columnGap: 2,
              rowGap: 0.5,
              px: 1,
              py: 0.5,
            }}
          >
            <Line label={t('builder.previewInput')} value={showBytes(input)} />

            {steps.map((step, index) => {
              if (step.unchanged) {
                return (
                  <Line
                    key={`${step.name}-${index}`}
                    label={`t:${step.name}`}
                    note={t('builder.previewUnchanged')}
                  />
                );
              }
              if (step.value === null) {
                return (
                  <Line
                    key={`${step.name}-${index}`}
                    label={`t:${step.name}`}
                    note={step.reproducible ? undefined : t('builder.previewOpaque')}
                  />
                );
              }
              const shown = showBytes(step.value);
              return (
                <Line
                  key={`${step.name}-${index}`}
                  label={`t:${step.name}`}
                  value={shown === '' ? undefined : shown}
                  note={shown === '' ? t('builder.previewEmptyValue') : undefined}
                />
              );
            })}

            {verdict !== null && (
              <Line
                label={`${operator.negated ? '!' : ''}@${operator.name}`}
                argument={operator.argument}
                note={t(VERDICT_KEY[verdict])}
                noteColor={VERDICT_COLOR[verdict]}
              />
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
}

const VERDICT_KEY = {
  match: 'builder.previewMatch',
  noMatch: 'builder.previewNoMatch',
  unknown: 'builder.previewUnknown',
} as const;

const VERDICT_COLOR = {
  match: 'success.main',
  noMatch: 'warning.main',
  unknown: 'text.disabled',
} as const;

interface LineProps {
  label: string;
  argument?: string;
  value?: string;
  note?: string;
  noteColor?: string;
}

const ARGUMENT_LIMIT = 32;

const VALUE_LIMIT = 200;

function Line({ label, argument, value, note, noteColor }: LineProps) {
  return (
    <>
      <Typography
        variant="caption"
        sx={{ fontFamily: MONO, color: 'text.disabled', whiteSpace: 'nowrap' }}
      >
        {label}
        {argument !== undefined && argument !== '' && (
          <>
            {' '}
            <Excerpt text={argument} limit={ARGUMENT_LIMIT} title={label} />
          </>
        )}
      </Typography>

      <Typography
        variant="caption"
        sx={{
          fontFamily: MONO,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {value !== undefined && <Excerpt text={value} limit={VALUE_LIMIT} title={label} />}
        {note !== undefined && (
          <Box component="span" sx={{ color: noteColor ?? 'text.disabled' }}>
            {note}
          </Box>
        )}
      </Typography>
    </>
  );
}
