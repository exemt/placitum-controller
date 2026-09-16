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
import type { ExclusionTarget } from '../../modsec/exclusions';

interface ExclusionTargetRowProps {
  target: ExclusionTarget;
  onChange: (next: ExclusionTarget) => void;
  onRemove: () => void;
  canRemove: boolean;
  error?: string;
}

export function ExclusionTargetRow({
  target,
  onChange,
  onRemove,
  canRemove,
  error,
}: ExclusionTargetRowProps) {
  const { t } = useI18n();
  const label = useLabel();

  const support = selectorSupport(target.name);
  const canCount = countSupported(target.name) && !target.remove;
  const caption = label(variableMeta(target.name)?.label, '');

  const [pending, setPending] = useState<ParamMode | null>(null);

  const modes: ParamMode[] = support === 'required' ? ['only'] : ['all', 'only'];
  const settled: ParamMode = support === 'required' ? 'only' : 'all';
  const mode = target.params.length > 0 ? 'only' : (pending ?? settled);

  const applyParams = (next: { mode: ParamMode; values: string[] }) => {
    setPending(next.mode === 'all' || next.values.length > 0 ? null : next.mode);

    const params = next.mode === 'all' ? [] : next.values;
    const same =
      params.length === target.params.length &&
      params.every((value, i) => value === target.params[i]);
    if (!same) onChange({ ...target, params });
  };

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `minmax(140px, 1fr) ${TOGGLE_COLUMN}px ${TOGGLE_COLUMN}px ${ICON_COLUMN}px`,
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
            label={t('builder.exclusionTargetScope')}
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
                count: countSupported(name) ? target.count : false,
              });
            }}
            inputSx={{ color: 'warning.light', fontWeight: 500 }}
            sx={{ minWidth: 0 }}
          />
        </Box>
      </Tooltip>

      <Tooltip
        title={t(target.remove ? 'builder.exclusionSignOnHint' : 'builder.exclusionSignOffHint')}
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <ToggleButton
            size="small"
            value="remove"
            color="error"
            selected={target.remove}
            onChange={() =>
              onChange({
                ...target,
                remove: !target.remove,
                count: target.remove ? target.count : false,
              })
            }
            aria-label={t('builder.exclusionSign')}
            sx={{ flex: 1, fontWeight: 700 }}
          >
            !
          </ToggleButton>
        </Box>
      </Tooltip>

      <Tooltip
        title={
          target.remove
            ? t('builder.exclusionTargetNoCount')
            : canCount
              ? t('builder.countHint')
              : t('builder.countUnavailable')
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
            modes={modes}
            allNote={t(
              target.remove ? 'builder.exclusionDropAllHint' : 'builder.exclusionAddAllHint',
            )}
            requiredNote={t('builder.exclusionParamRequired')}
            note={t('builder.exclusionTargetNoExcept')}
            suggestions={selectorSuggestions(target.name)}
            onChange={applyParams}
          />
        </Box>
      )}
    </Box>
  );
}
