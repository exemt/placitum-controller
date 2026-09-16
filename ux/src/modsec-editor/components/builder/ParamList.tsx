import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { ChipInput } from './ChipInput';
import { useI18n } from '../../i18n/useI18n';
import type { Suggestion } from '../../modsec/suggestions';

export type ParamMode = 'all' | 'only' | 'except';

interface ParamListProps {
  mode: ParamMode;
  values: string[];
  onChange: (next: { mode: ParamMode; values: string[] }) => void;
  suggestions?: Suggestion[];
  modes?: ParamMode[];
  note?: string;
  allNote?: string;
  requiredNote?: string;
  baseless?: boolean;
}

export function ParamList({
  mode,
  values,
  onChange,
  suggestions,
  modes = ['all', 'only', 'except'],
  note,
  allNote,
  requiredNote,
  baseless = false,
}: ParamListProps) {
  const { t } = useI18n();

  const excluding = mode === 'except';
  const incomplete = !baseless && mode !== 'all' && values.length === 0;
  const requiredText = requiredNote ?? t('builder.paramsRequired');

  const setValues = (next: string[]) => {
    const settled = next.length === 0 ? 'all' : mode === 'all' ? 'only' : mode;
    onChange({ mode: settled, values: next });
  };

  const modeLabel = baseless
    ? t('builder.except')
    : mode === 'all'
      ? t('builder.paramsAll')
      : excluding
        ? t('builder.paramsExcept')
        : t('builder.paramsOnly');

  const order = values.length === 0 ? modes : modes.filter((m) => m !== 'all');
  const nextMode = order[(order.indexOf(mode) + 1) % order.length];

  const switchable = !baseless && order.length > 1;

  const modeChip = (
    <Tooltip
      describeChild
      title={
        <>
          {mode === 'all' && <div>{allNote ?? t('builder.paramsAllHint')}</div>}
          {incomplete && <div>{requiredText}</div>}
          {switchable && (
            <div>
              {t(
                modes.includes('except') ? 'builder.paramsModeHint' : 'builder.paramsModeTwoHint',
              )}
            </div>
          )}
          {!baseless && values.length > 0 && modes.includes('all') && (
            <div>{t('builder.paramsAllBlocked')}</div>
          )}
          {note !== undefined && <div>{note}</div>}
        </>
      }
    >
      <Chip
        size="small"
        color={excluding ? 'error' : mode === 'all' ? 'default' : 'warning'}
        label={modeLabel}
        onMouseDown={(event) => event.preventDefault()}
        onClick={
          switchable
            ? (event) => {
                event.stopPropagation();
                onChange({ mode: nextMode, values });
              }
            : undefined
        }
        sx={{ fontWeight: 700, letterSpacing: 0.5 }}
      />
    </Tooltip>
  );

  return (
    <ChipInput
      fullWidth
      monospace
      prefix={modeChip}
      chipColor={excluding ? 'error' : 'warning'}
      label={t('builder.parameters')}
      placeholder={excluding ? t('builder.addExcept') : t('builder.addParam')}
      dialogTitle={excluding ? t('builder.exclusions') : t('builder.parameters')}
      separators={[',']}
      suggestions={suggestions}
      values={values}
      error={incomplete}
      helperText={incomplete ? requiredText : undefined}
      renderLabel={(value) => (value === '' ? t('builder.anyParameter') : value)}
      onChange={setValues}
    />
  );
}
