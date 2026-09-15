import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactElement, ReactNode } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { CommitField } from './CommitField';
import { filterSuggestions, useSuggestionList } from './useSuggestionList';
import type { Suggestion } from '../../modsec/suggestions';
import type { SxProps, Theme } from '@mui/material/styles';

interface SuggestFieldProps {
  value: string;
  onCommit: (next: string) => void;
  suggestions: Suggestion[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  monospace?: boolean;
  fullWidth?: boolean;
  required?: boolean;
  error?: string;
  endAdornment?: ReactNode;
  optionEnd?: (option: Suggestion) => ReactNode;
  inputSx?: Record<string, unknown>;
  sx?: Record<string, unknown>;
}

export function SuggestField({
  value,
  onCommit,
  suggestions,
  label,
  placeholder,
  disabled = false,
  monospace = false,
  fullWidth,
  required = false,
  error,
  endAdornment,
  optionEnd,
  inputSx,
  sx,
}: SuggestFieldProps) {
  const { slotProps, groupBy, renderGroup, renderOption } = useSuggestionList(suggestions, {
    optionEnd,
  });
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [pristine, setPristine] = useState(true);
  const focused = useRef(false);
  const reverted = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    if (next !== value) onCommit(next);
  };

  const fieldSx = {
    ...sx,
    '& .MuiInputBase-input': {
      ...(monospace ? { fontFamily: 'ui-monospace, Consolas, monospace' } : {}),
      ...inputSx,
    },
  } as SxProps<Theme>;

  const withReason = (field: ReactElement) =>
    error === undefined ? (
      field
    ) : (
      <Tooltip title={error} disableFocusListener>
        {field}
      </Tooltip>
    );

  if (suggestions.length === 0) {
    return withReason(
      <CommitField
        size="small"
        label={label}
        placeholder={placeholder}
        disabled={disabled}
        fullWidth={fullWidth}
        error={error !== undefined}
        value={value}
        onCommit={onCommit}
        sx={fieldSx}
        slotProps={endAdornment === undefined ? undefined : { input: { endAdornment } }}
      />,
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || open) return;
    event.stopPropagation();
    reverted.current = true;
    setDraft(value);
    event.currentTarget.blur();
  };

  return withReason(
    <Autocomplete<Suggestion, false, boolean, true>
      freeSolo
      forcePopupIcon
      openOnFocus
      selectOnFocus
      handleHomeEndKeys
      size="small"
      disableClearable={required}
      disabled={disabled}
      fullWidth={fullWidth}
      options={suggestions}
      filterOptions={(options, state) =>
        pristine ? options : filterSuggestions(options, state)
      }
      groupBy={groupBy}
      renderGroup={renderGroup}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.value)}
      value={null}
      inputValue={draft}
      onInputChange={(_, next, reason) => {
        if (reason === 'input') {
          setDraft(next);
          setPristine(false);
        }
        if (reason === 'clear') {
          setDraft('');
          commit('');
        }
      }}
      onChange={(_, next) => {
        const text = next === null ? '' : typeof next === 'string' ? next : next.value;
        setDraft(text);
        setPristine(true);
        commit(text);
      }}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      slotProps={slotProps}
      renderOption={renderOption}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error !== undefined}
          sx={fieldSx}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment:
                endAdornment === undefined ? (
                  params.slotProps.input.endAdornment
                ) : (
                  <>
                    {params.slotProps.input.endAdornment}
                    {endAdornment}
                  </>
                ),
            },
            htmlInput: {
              ...params.slotProps.htmlInput,
              onKeyDown: handleKeyDown,
              onFocus: (event: FocusEvent<HTMLInputElement>) => {
                focused.current = true;
                setPristine(true);
                params.slotProps.htmlInput.onFocus?.(event);
              },
              onBlur: (event: FocusEvent<HTMLInputElement>) => {
                focused.current = false;
                params.slotProps.htmlInput.onBlur?.(event);
                if (reverted.current) {
                  reverted.current = false;
                  return;
                }
                commit(draft);
              },
            },
          }}
        />
      )}
    />,
  );
}
