import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import { BracketLine } from './Bracket';
import { ParamList } from './ParamList';
import { SuggestField } from './SuggestField';
import { useLabel } from './useLabel';
import { ICON_COLUMN, TOGGLE_COLUMN } from './layout';
import { useI18n } from '../../i18n/useI18n';
import { countSupported, selectorSupport, variableMeta } from '../../modsec/semantics';
import { VARIABLE_SUGGESTIONS, selectorSuggestions } from '../../modsec/suggestions';
import type { ParamMode } from './ParamList';
import type { VisualTarget } from '../../modsec/model';

interface TargetRowProps {
  target: VisualTarget;
  onChange: (next: VisualTarget) => void;
  onRemove: () => void;
  canRemove: boolean;
  error?: string;
  countBlocked?: string;
  exceptBlocked?: string;
}

export function TargetRow({
  target,
  onChange,
  onRemove,
  canRemove,
  error,
  countBlocked,
  exceptBlocked,
}: TargetRowProps) {
  const { t } = useI18n();
  const label = useLabel();

  const canCount = countSupported(target.name) && countBlocked === undefined;
  const support = selectorSupport(target.name);
  const caption = label(variableMeta(target.name)?.label, '');

  const modes: ParamMode[] =
    support === 'required'
      ? ['only']
      : exceptBlocked === undefined
        ? ['all', 'only', 'except']
        : ['all', 'only'];

  const [pending, setPending] = useState<ParamMode | null>(null);

  const settled: ParamMode =
    target.mode === 'except'
      ? 'except'
      : target.params.length > 0 || support === 'required'
        ? 'only'
        : 'all';
  const mode = target.params.length === 0 ? (pending ?? settled) : settled;

  const applyParams = (next: { mode: ParamMode; values: string[] }) => {
    setPending(next.mode === 'all' || next.values.length > 0 ? null : next.mode);

    const params = next.mode === 'all' ? [] : next.values;
    const stored = next.mode === 'except' && params.length > 0 ? 'except' : 'only';
    const same =
      stored === target.mode &&
      params.length === target.params.length &&
      params.every((value, i) => value === target.params[i]);
    if (!same) onChange({ ...target, mode: stored, params });
  };

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `minmax(140px, 1fr) ${TOGGLE_COLUMN}px ${ICON_COLUMN}px`,
        columnGap: 1,
        rowGap: 0.5,
        alignItems: 'center',
      }}
    >
      <BracketLine name="target" />

      <Tooltip title={caption} placement="top-start" enterDelay={600}>
        <Box sx={{ minWidth: 0 }}>
          <SuggestField
            required
            label={t('builder.scope')}
            error={error}
            suggestions={VARIABLE_SUGGESTIONS}
            value={target.name}
            onCommit={(name) => {
              const next = selectorSupport(name);
              setPending(null);
              onChange({
                ...target,
                name,
                params: next === 'none' ? [] : target.params,
                mode: next === 'required' ? 'only' : target.mode,
                count: countSupported(name) ? target.count : false,
              });
            }}
            inputSx={{ color: 'warning.light', fontWeight: 500 }}
            sx={{ minWidth: 0 }}
          />
        </Box>
      </Tooltip>

      <Tooltip
        title={
          countBlocked ?? (canCount ? t('builder.countHint') : t('builder.countUnavailable'))
        }
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <ToggleButton
            size="small"
            value="count"
            color="success"
            disabled={!canCount}
            selected={target.count}
            onChange={() => onChange({ ...target, count: !target.count })}
            sx={{ flex: 1, fontFamily: 'monospace' }}
          >
            &amp;
          </ToggleButton>
        </Box>
      </Tooltip>

      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        {canRemove && (
          <Tooltip title={t('builder.deleteTarget')}>
            <IconButton size="small" onClick={onRemove}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {support !== 'none' && (
        <Box sx={{ gridColumn: '1 / -2', alignSelf: 'start', minWidth: 0, mt: 1.5 }}>
          <ParamList
            mode={mode}
            values={target.params}
            baseless={target.excludeOnly}
            modes={modes}
            note={exceptBlocked}
            suggestions={selectorSuggestions(target.name)}
            onChange={applyParams}
          />
        </Box>
      )}
    </Box>
  );
}
