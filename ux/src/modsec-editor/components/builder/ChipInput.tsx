import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { AutocompleteRenderInputParams } from '@mui/material/Autocomplete';
import type { ChipProps } from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';
import { filterSuggestions, useSuggestionList } from './useSuggestionList';
import { useI18n } from '../../i18n/useI18n';
import {
  CHIP_HEIGHT,
  CONTROL_HEIGHT,
  DIALOG_FIELD_TOP,
  FIELD_ACTION_HEIGHT,
  FIELD_ACTION_INSET,
  FIELD_GUTTER,
} from '../../theme';
import type { Suggestion } from '../../modsec/suggestions';

interface ChipInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  label?: string;
  prefix?: ReactNode;
  ariaLabel?: string;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
  dialogTitle?: string;
  disabled?: boolean;
  chipColor?: ChipProps['color'];
  renderLabel?: (value: string) => string;
  wrapChip?: (value: string, chip: ReactElement) => ReactNode;
  separators?: string[];
  suggestions?: Suggestion[];
  optionEnd?: (option: Suggestion) => ReactNode;
  isValueValid?: (value: string) => boolean;
  invalidHint?: string;
  monospace?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

const ACTIONS_GAP = 4;

const ROW_HEIGHT = FIELD_ACTION_HEIGHT;

const ROW_PAD = (CONTROL_HEIGHT - ROW_HEIGHT) / 2;

const CHIP_LIFT = (ROW_HEIGHT - CHIP_HEIGHT) / 2;

const DRAFT_MIN_WIDTH = 60;

function splitValues(raw: string, separators: string[]): string[] {
  let parts = [raw];
  for (const separator of ['\n', ...separators]) {
    parts = parts.flatMap((part) => part.split(separator));
  }
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

export function ChipInput({
  values,
  onChange,
  label,
  prefix,
  ariaLabel,
  placeholder,
  helperText,
  error = false,
  dialogTitle,
  disabled = false,
  chipColor = 'default',
  renderLabel,
  wrapChip,
  separators = [],
  suggestions = [],
  optionEnd,
  isValueValid,
  invalidHint,
  monospace = false,
  fullWidth = false,
  sx,
}: ChipInputProps) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const { slotProps, groupBy, renderGroup, renderOption } = useSuggestionList(suggestions, {
    optionEnd,
  });

  const actionsRef = useRef<HTMLDivElement>(null);
  const [actionsWidth, setActionsWidth] = useState(0);

  useEffect(() => {
    const node = actionsRef.current;
    if (node === null) {
      setActionsWidth(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setActionsWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const reserved = actionsWidth === 0 ? 0 : actionsWidth + ACTIONS_GAP;

  const invalidCount = isValueValid ? values.filter((v) => !isValueValid(v)).length : 0;

  const commit = (raw: string) => {
    const added = splitValues(raw, separators).filter((v) => !values.includes(v));
    if (added.length > 0) onChange([...values, ...added]);
  };

  const applyText = () => {
    if (text !== null) {
      const parsed = splitValues(text, separators);
      const unique = parsed.filter((value, i) => parsed.indexOf(value) === i);
      const same =
        unique.length === values.length && unique.every((v, i) => v === values[i]);
      if (!same) onChange(unique);
    }
    setText(null);
  };

  const handleInput = (raw: string) => {
    const hits = separators.map((s) => raw.lastIndexOf(s)).filter((i) => i >= 0);
    if (hits.length === 0) {
      setDraft(raw);
      return;
    }
    const cut = Math.max(...hits);
    commit(raw.slice(0, cut));
    setDraft(raw.slice(cut + 1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (suggestions.length > 0) return;
      event.preventDefault();
      commit(draft);
      setDraft('');
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!open) setDraft('');
      return;
    }
    if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const hasActions = dialogTitle !== undefined || suggestions.length > 0;

  const editButton = dialogTitle === undefined ? undefined : (
    <InputAdornment position="end">
      <Tooltip title={t('builder.editInWindow')}>
        <span>
          <IconButton disabled={disabled} onClick={() => setText(values.join('\n'))}>
            <EditOutlinedIcon />
          </IconButton>
        </span>
      </Tooltip>
    </InputAdornment>
  );

  const renderField = (params?: AutocompleteRenderInputParams) => (
    <FormControl
      size="small"
      fullWidth={fullWidth || params !== undefined}
      disabled={disabled}
      error={error || invalidCount > 0}
      sx={params === undefined ? sx : undefined}
    >
      {label !== undefined && (
        <InputLabel shrink htmlFor={id} {...params?.slotProps.inputLabel}>
          {label}
        </InputLabel>
      )}
      <OutlinedInput
        {...params?.slotProps.input}
        id={params?.id ?? id}
        notched={label !== undefined}
        label={label}
        inputProps={{
          ...params?.slotProps.htmlInput,
          'aria-label': ariaLabel,
          onKeyDown: handleKeyDown,
        }}
        value={draft}
        placeholder={values.length === 0 ? placeholder : undefined}
        onChange={(event) => handleInput(event.target.value)}
        onBlur={() => {
          commit(draft);
          setDraft('');
        }}
        startAdornment={
          <>
            {reserved > 0 && (
              <Box aria-hidden sx={{ float: 'right', width: `${reserved}px`, height: '1px' }} />
            )}
            {prefix}
            {values.map((value, index) => {
              const valid = isValueValid === undefined || isValueValid(value);
              const title =
                wrapChip !== undefined
                  ? undefined
                  : valid
                    ? value
                    : invalidHint === undefined
                      ? value
                      : `${value} — ${invalidHint}`;
              const text = renderLabel === undefined ? value : renderLabel(value);
              const chip = (
                <Chip
                  size="small"
                  color={valid ? chipColor : 'error'}
                  variant={valid ? 'outlined' : 'filled'}
                  label={text}
                  disabled={disabled}
                  onDelete={() => onChange(values.filter((_, i) => i !== index))}
                  title={title}
                  sx={
                    monospace
                      ? { fontFamily: 'ui-monospace, Consolas, monospace' }
                      : undefined
                  }
                />
              );
              return (
                <Fragment key={`${value}-${index}`}>
                  {wrapChip === undefined ? chip : wrapChip(value, chip)}
                </Fragment>
              );
            })}
          </>
        }
        endAdornment={
          hasActions && (
            <Box
              ref={actionsRef}
              sx={{
                position: 'absolute',
                top: `${ROW_PAD}px`,
                right: `${FIELD_ACTION_INSET}px`,
                height: `${ROW_HEIGHT}px`,
                display: 'flex',
                alignItems: 'center',
                '& .MuiAutocomplete-endAdornment, & .MuiInputAdornment-positionEnd': {
                  my: 0,
                },
              }}
            >
              {params?.slotProps.input.endAdornment}
              {editButton}
            </Box>
          )
        }
        sx={{
          '&.MuiOutlinedInput-root.MuiInputBase-root.MuiInputBase-sizeSmall': {
            position: 'relative',
            display: 'block',
            minHeight: CONTROL_HEIGHT,
            lineHeight: `${ROW_HEIGHT}px`,
            pl: `${FIELD_GUTTER}px`,
            pr: `${hasActions ? FIELD_ACTION_INSET : FIELD_GUTTER}px`,
            py: `${ROW_PAD}px`,
            '& > .MuiChip-root': {
              verticalAlign: 'top',
              mt: `${CHIP_LIFT}px`,
              mr: `${ACTIONS_GAP}px`,
              maxWidth: `calc(100% - ${reserved + ACTIONS_GAP}px)`,
            },
            '& .MuiInputBase-input': {
              display: 'inline-block',
              verticalAlign: 'top',
              height: `${ROW_HEIGHT}px`,
              width: 'auto',
              minWidth: DRAFT_MIN_WIDTH,
              maxWidth: '100%',
              fieldSizing: 'content',
              p: 0,
              ...(monospace ? { fontFamily: 'ui-monospace, Consolas, monospace' } : {}),
            },
          },
        }}
      />
      {invalidCount > 0 && invalidHint !== undefined ? (
        <FormHelperText>{invalidHint}</FormHelperText>
      ) : (
        helperText !== undefined && <FormHelperText>{helperText}</FormHelperText>
      )}
    </FormControl>
  );

  const dialog = dialogTitle === undefined ? null : (
    <Dialog open={text !== null} onClose={() => setText(null)} fullWidth maxWidth="sm">
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          maxRows={16}
          margin="dense"
          label={label ?? dialogTitle}
          value={text ?? ''}
          helperText={
            separators.includes(',')
              ? `${t('builder.listHint')} ${t('builder.listHintComma')}`
              : t('builder.listHint')
          }
          onChange={(event) => setText(event.target.value)}
          slotProps={{
            input: monospace
              ? { sx: { fontFamily: 'ui-monospace, Consolas, monospace' } }
              : undefined,
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setText(null)}>{t('app.cancel')}</Button>
        <Button variant="contained" onClick={applyText}>
          {t('app.apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (suggestions.length === 0)
    return (
      <>
        {renderField()}
        {dialog}
      </>
    );

  return (
    <>
      <Autocomplete<Suggestion, false, false, true>
        freeSolo
        forcePopupIcon
        openOnFocus
        handleHomeEndKeys
        size="small"
        disabled={disabled}
        fullWidth={fullWidth || undefined}
        options={suggestions}
        filterOptions={filterSuggestions}
        groupBy={groupBy}
        renderGroup={renderGroup}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.value)}
        value={null}
        inputValue={draft}
        onChange={(_, next) => {
          commit(next === null ? '' : typeof next === 'string' ? next : next.value);
          setDraft('');
        }}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        slotProps={slotProps}
        renderOption={renderOption}
        renderInput={renderField}
        sx={sx}
      />
      {dialog}
    </>
  );
}
