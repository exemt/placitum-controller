import { useMemo, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import StarRateRoundedIcon from '@mui/icons-material/StarRateRounded';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { useLabel } from './useLabel';
import { ListSection } from './ListSection';
import { setFullList, useFullList } from './fullList';
import { useI18n } from '../../i18n/useI18n';
import { FIELD_GUTTER } from '../../theme';
import type { SectionTone } from './ListSection';
import type { Choice } from '../../modsec/choices';
import type { SxProps, Theme } from '@mui/material/styles';

const MONO = 'ui-monospace, Consolas, monospace';

const filterChoices = createFilterOptions<Choice>({
  stringify: (choice) =>
    [
      choice.value,
      choice.label.en,
      choice.label.ru,
      choice.note.en,
      choice.note.ru,
    ].join(' '),
  trim: true,
});

interface ChoiceFieldProps {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (next: string) => void;
  prefix?: string;
  emptyLabel?: string;
  raw?: boolean;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  inputSx?: Record<string, unknown>;
  sx?: Record<string, unknown>;
}

export function ChoiceField({
  label,
  value,
  choices,
  onChange,
  prefix = '',
  emptyLabel,
  raw = false,
  error,
  autoFocus = false,
  disabled = false,
  disabledReason,
  inputSx,
  sx,
}: ChoiceFieldProps) {
  const { t } = useI18n();
  const localize = useLabel();
  const full = useFullList();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = choices.find((choice) => choice.value === value) ?? null;

  const short = useMemo(
    () =>
      choices.filter(
        (choice) =>
          choice.unfit === null &&
          (choice.recommended || choice.common || choice.value === value),
      ),
    [choices, value],
  );
  const hidden = choices.length - short.length;

  const shortens = hidden > 0;

  const tones = useMemo(() => {
    const map = new Map<string, SectionTone>();
    for (const choice of choices) {
      const name = localize(choice.group, '');
      if (map.has(name)) continue;
      map.set(name, choice.unfit !== null ? 'unfit' : choice.recommended ? 'fit' : 'plain');
    }
    return map;
  }, [choices, localize]);

  const sectioned = tones.size > 1;

  const footer = useRef({ full, hidden, shortens, t });
  footer.current = { full, hidden, shortens, t };

  const ChoicePaper = useMemo(
    () =>
      function ChoicePaper(props: HTMLAttributes<HTMLElement>) {
        const state = footer.current;
        if (!state.shortens) return <Paper {...props} />;
        return (
          <Paper {...props}>
            {props.children}
            <Divider />
            <Button
              fullWidth
              startIcon={state.full ? <UnfoldLessIcon /> : <UnfoldMoreIcon />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setFullList(!state.full)}
              sx={{
                justifyContent: 'flex-start',
                px: `${FIELD_GUTTER}px`,
                py: 0.75,
                borderRadius: 0,
                fontSize: 11,
                letterSpacing: '0.06em',
                color: 'text.secondary',
                '& .MuiButton-startIcon': { color: 'primary.light' },
                '&:hover': { color: 'text.primary' },
              }}
            >
              {state.full
                ? state.t('builder.choiceCommon')
                : state.t('builder.choiceAll', { count: String(state.hidden) })}
            </Button>
          </Paper>
        );
      },
    [],
  );

  const fieldSx = {
    ...sx,
    '& .MuiInputBase-input': {
      ...(raw && { fontFamily: MONO }),
      ...inputSx,
      ...(disabled && { pointerEvents: 'none' }),
    },
    ...(disabled &&
      error !== undefined && {
        '& .Mui-disabled': {
          color: 'error.main',
          WebkitTextFillColor: (theme: Theme) => theme.palette.error.main,
        },
        '& .MuiOutlinedInput-root.Mui-disabled .MuiOutlinedInput-notchedOutline': {
          borderColor: 'error.main',
        },
      }),
  };

  const field = (
    <Autocomplete<Choice, false, boolean, false>
      openOnFocus={!autoFocus}
      autoHighlight
      selectOnFocus
      handleHomeEndKeys
      fullWidth
      size="small"
      disabled={disabled}
      disableClearable={emptyLabel === undefined}
      options={choices}
      value={selected}
      onChange={(_, next) => onChange(next === null ? '' : next.value)}
      onInputChange={(_, next, reason) => setQuery(reason === 'input' ? next : '')}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      getOptionLabel={(choice) => (raw ? choice.value : localize(choice.label, choice.value))}
      isOptionEqualToValue={(choice, current) => choice.value === current.value}
      groupBy={sectioned ? (choice) => localize(choice.group, '') : undefined}
      filterOptions={(options, state) => {
        const text = query.trim();
        if (text !== '') return filterChoices(options, { ...state, inputValue: text });
        return full ? options : short;
      }}
      slots={{ paper: ChoicePaper }}
      renderGroup={(params) => (
        <ListSection key={params.key} title={params.group} tone={tones.get(params.group)}>
          {params.children}
        </ListSection>
      )}
      slotProps={{
        popper: {
          placement: 'bottom-start',
          style: { width: 'fit-content', minWidth: 320, maxWidth: 'min(540px, 92vw)' },
        },
      }}
      renderOption={({ key: _label, ...props }, choice) => (
        <ChoiceOption
          {...props}
          key={choice.value}
          choice={choice}
          prefix={prefix}
          marked={shortens && full && choice.common}
        />
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          error={error !== undefined}
          placeholder={error ?? emptyLabel}
          sx={fieldSx as SxProps<Theme>}
          slotProps={{
            ...params.slotProps,
            inputLabel: { ...params.slotProps.inputLabel, shrink: true },
          }}
        />
      )}
    />
  );

  const hint = disabled ? disabledReason : (error ?? describe(selected, prefix, localize));
  if (hint === undefined || hint === '') return field;

  return (
    <Tooltip title={open ? '' : hint} placement="top-start" enterDelay={600}>
      <Box sx={{ minWidth: 0 }}>{field}</Box>
    </Tooltip>
  );
}

function describe(
  choice: Choice | null,
  prefix: string,
  localize: ReturnType<typeof useLabel>,
): string {
  if (choice === null) return '';
  return `${prefix}${choice.value} — ${localize(choice.note, '')}`;
}

interface ChoiceOptionProps extends HTMLAttributes<HTMLLIElement> {
  choice: Choice;
  prefix: string;
  marked: boolean;
}

function ChoiceOption({ choice, prefix, marked, ...props }: ChoiceOptionProps) {
  const { t } = useI18n();
  const localize = useLabel();

  return (
    <Box component="li" {...props} sx={{ alignItems: 'stretch' }}>
      <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%', py: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{ minWidth: 0, color: choice.unfit ? 'text.disabled' : 'inherit' }}
          >
            {localize(choice.label, choice.value)}
          </Typography>

          {marked && (
            <Tooltip title={t('builder.choiceOften')} placement="top" enterDelay={400}>
              <StarRateRoundedIcon
                sx={{ flexShrink: 0, fontSize: 15, color: 'success.main' }}
              />
            </Tooltip>
          )}

          <Box sx={{ flex: 1, minWidth: 8 }} />

          <Typography
            variant="caption"
            sx={{
              flexShrink: 0,
              fontFamily: MONO,
              px: 0.5,
              borderRadius: 0.5,
              bgcolor: 'action.hover',
              color: choice.unfit ? 'text.disabled' : 'text.secondary',
            }}
          >
            {prefix}
            {choice.value}
          </Typography>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: 'normal', lineHeight: 1.35 }}
        >
          {localize(choice.note, '')}
        </Typography>

        {choice.unfit !== null && (
          <Typography variant="caption" sx={{ whiteSpace: 'normal', color: 'warning.main' }}>
            {localize(choice.unfit, '')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
