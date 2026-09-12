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
  /** Варианты для списка; с пустым списком поле остаётся обычным. */
  suggestions: Suggestion[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  monospace?: boolean;
  /**
   * Не задано — поле занимает всю ширину своего места в раскладке. Явное
   * `false` MUI понимает иначе: поле сжимается до собственной ширины.
   */
  fullWidth?: boolean;
  /** Значение обязательно — крестик «очистить» не показывается. */
  required?: boolean;
  /** Чем плохо стоящее в поле значение: рамка краснеет, текст уходит в подсказку. */
  error?: string;
  /** Кнопка, встающая внутрь поля последней в ряду служебных иконок. */
  endAdornment?: ReactNode;
  /**
   * Отметка справа от варианта в списке.
   *
   * У имён переменных — чип «N | i» с числом мест и той же подсказкой,
   * что у выбранного значения в поле.
   */
  optionEnd?: (option: Suggestion) => ReactNode;
  /** Оформление самого значения — цвет и начертание. */
  inputSx?: Record<string, unknown>;
  sx?: Record<string, unknown>;
}

/**
 * Поле свободного ввода с выпадающим списком готовых вариантов.
 *
 * ModSecurity почти везде ждёт произвольную строку, но набор осмысленных
 * строк невелик и известен заранее: имена заголовков, счётчики CRS, коды
 * ответа, метки. Список показывает их вместе с пояснением, зачем каждое
 * нужно, и снимает необходимость помнить точное написание.
 *
 * Ограничением список при этом не становится: поле остаётся свободным, а
 * своё значение уходит наружу ровно как в {@link CommitField} — по
 * завершении ввода, а не на каждый символ. Когда подсказывать нечего, поле
 * и есть {@link CommitField}: пустой список бесполезен, а лишняя стрелка
 * обещает варианты, которых нет.
 */
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
  // Ввода ещё не было: список показывается целиком, а не сужается до
  // уже стоящего в поле значения.
  const [pristine, setPristine] = useState(true);
  const focused = useRef(false);
  const reverted = useRef(false);

  // Пока поле в фокусе, внешние обновления не перетирают ввод.
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

  // Причина ошибки уезжает в подсказку: под полем ей места нет — в строке
  // условия каждое поле стоит в своей колонке, и подпись под одним из них
  // развела бы соседей по высоте. Подсказка по наведению, но не по фокусу:
  // во время правки всплывающее окно закрывало бы то, что набирают.
  //
  // Подсказка вешается на само поле, а не на обёртку вокруг него. Обёртка
  // здесь стоила бы отступа: раскладка строки держится на `Stack`, который
  // разводит соседей полем `margin` у прямых детей, — и лишний узел забрал
  // бы этот отступ себе.
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

  // Enter и стрелки остаются за списком: он сам подставит выбранный вариант,
  // а без выделения — набранный текст. Своя обработка нужна только Escape,
  // и только при закрытом списке: открытый он закрывает сам.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || open) return;
    // Дальше события пускать нельзя: диалог редактора принял бы Escape на
    // свой счёт и закрылся.
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
      // Пока в поле стоит прежнее значение, отбирать по нему нечего:
      // иначе открытый список показывал бы ровно то, что уже введено, и
      // посмотреть остальные варианты можно было бы только через очистку.
      filterOptions={(options, state) =>
        pristine ? options : filterSuggestions(options, state)
      }
      groupBy={groupBy}
      renderGroup={renderGroup}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.value)}
      // Выбор варианта не запоминается: единственное состояние поля — его
      // текст. Иначе тот же вариант нельзя было бы выбрать второй раз,
      // после правки текста руками.
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
        // `params.slotProps` держит привязку поля к списку: свои значения
        // можно только дописывать поверх, но не подменять целиком.
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
              // Крестик и стрелка принадлежат списку и стоят вплотную к
              // значению — они о том, что в поле уже написано. Карандаш
              // уводит правку в отдельное окно и потому замыкает ряд:
              // край поля — место для выхода из него, а не для его начинки.
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
