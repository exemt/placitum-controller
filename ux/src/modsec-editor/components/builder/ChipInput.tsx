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
  /** Плавающая подпись поля — как у обычного `TextField`. */
  label?: string;
  /** Постоянная метка внутри поля: короткая, вместо плавающей подписи. */
  prefix?: ReactNode;
  /** Имя поля для скринридера, когда подпись нарисована через `prefix`. */
  ariaLabel?: string;
  placeholder?: string;
  helperText?: string;
  /** Поле заполнено не до конца: рамка и подпись под ней краснеют. */
  error?: boolean;
  /**
   * Заголовок окна правки. С ним у поля появляется карандаш, открывающий
   * весь список построчным текстом; без него окна нет.
   */
  dialogTitle?: string;
  disabled?: boolean;
  chipColor?: ChipProps['color'];
  /** Подпись чипа, если она отличается от самого значения. */
  renderLabel?: (value: string) => string;
  /**
   * Обёртка вокруг чипа значения.
   *
   * У тегов — подсказка «кто ещё носит этот ярлык»: смысл тега лежит не в
   * нём самом, и сказать это надо у самого значения, а не у поля целиком.
   */
  wrapChip?: (value: string, chip: ReactElement) => ReactNode;
  /**
   * Символы, разделяющие значения при вводе и вставке. Пустой список —
   * значение добавляется только по Enter.
   */
  separators?: string[];
  /** Готовые варианты очередного значения; пустой список ничего не меняет. */
  suggestions?: Suggestion[];
  /**
   * Отметка справа от варианта в списке.
   *
   * У тегов — чип «N | i» с числом правил и той же подсказкой, что у
   * выбранного значения в поле.
   */
  optionEnd?: (option: Suggestion) => ReactNode;
  /**
   * Проверка отдельного значения — например, что запись похожа на IPv4-
   * или IPv6-адрес. Без неё все чипы равноправны.
   */
  isValueValid?: (value: string) => boolean;
  /** Что показать про значение, не прошедшее `isValueValid`. */
  invalidHint?: string;
  monospace?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

/** Просвет между содержимым строки и рядом значков в углу поля. */
const ACTIONS_GAP = 4;

/**
 * Высота строки внутри поля — по самому высокому, что в ней стоит: по
 * служебной кнопке. Чипы и текст ниже и встают в строке по центру.
 */
const ROW_HEIGHT = FIELD_ACTION_HEIGHT;

/**
 * Отступ содержимого сверху и снизу: со строкой он и составляет высоту поля
 * с одной строкой. Рамка в счёт не идёт — её рисует отдельный слой поверх,
 * своего места в поле она не занимает.
 */
const ROW_PAD = (CONTROL_HEIGHT - ROW_HEIGHT) / 2;

/** Подъём чипа до середины строки: строка выше чипа на просвет между строками. */
const CHIP_LIFT = (ROW_HEIGHT - CHIP_HEIGHT) / 2;

/** Место под очередное значение, пока его не набрали. */
const DRAFT_MIN_WIDTH = 60;

/**
 * Разбивает введённый текст на готовые значения.
 *
 * Перенос строки — разделитель всегда: список, скопированный из файла или
 * из чужого конфига, должен превращаться в набор чипов сам.
 */
function splitValues(raw: string, separators: string[]): string[] {
  let parts = [raw];
  for (const separator of ['\n', ...separators]) {
    parts = parts.flatMap((part) => part.split(separator));
  }
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * Поле-набор значений: каждое значение — отдельный чип, ввод продолжается
 * тут же в поле.
 *
 * Списки в ModSecurity живут внутри одной строки — исключения переменной,
 * теги, адреса `@ipMatch` через запятую, фразы `@pm` через пробел. Строку
 * с разделителями человеку приходится читать посимвольно и править вслепую;
 * чипы показывают ровно то, из чего список состоит, и дают удалить один
 * элемент, не задев соседние. Разделители при этом остаются рабочими:
 * вставка `10.0.0.0/8,192.168.0.0/16` сразу распадается на два чипа.
 *
 * Со списком подсказок поле работает так же, только очередное значение
 * можно не набирать, а выбрать из готовых — выбранное сразу становится
 * чипом.
 *
 * Чипы хороши, пока список правят по одному значению. Переписать его
 * целиком, вставить готовый перечень из чужого конфига или просто прочитать
 * длинный список, не помещающийся в строку, проще текстом — это и делает
 * окно правки за карандашом: те же значения, по одному в строке.
 *
 * Опечатка в одном значении списка — самая незаметная из ошибок: остальные
 * чипы выглядят так же, и найти среди десятка адресов один не-адрес можно
 * только построчным сравнением. С `isValueValid` сломанный чип краснеет
 * сам, на своём месте, и подсказывает почему — искать его по всему списку
 * не нужно.
 */
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
  // Текст окна правки; `null` — окно закрыто.
  const [text, setText] = useState<string | null>(null);
  const { slotProps, groupBy, renderGroup, renderOption } = useSuggestionList(suggestions, {
    optionEnd,
  });

  // Ряд значков в углу поля стоит вне строк и в переносе чипов не участвует:
  // иначе при заполнении поля он «плывёт» вслед за последним чипом вместо
  // того, чтобы стоять на месте. Место в первой строке под него занимает
  // распорка, а её ширина меряется по самому ряду: значков то один, то три —
  // крестик списка появляется только с набранным текстом.
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

  /** Место, отданное значкам в первой строке: сам ряд и просвет до него. */
  const reserved = actionsWidth === 0 ? 0 : actionsWidth + ACTIONS_GAP;

  const invalidCount = isValueValid ? values.filter((v) => !isValueValid(v)).length : 0;

  const commit = (raw: string) => {
    const added = splitValues(raw, separators).filter((v) => !values.includes(v));
    if (added.length > 0) onChange([...values, ...added]);
  };

  /** Список из окна заменяет прежний целиком — в этом и смысл окна. */
  const applyText = () => {
    if (text !== null) {
      const parsed = splitValues(text, separators);
      // Повторы схлопываются: одно и то же значение дважды бессмысленно.
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
    // Хвост после последнего разделителя ещё дописывают — он остаётся в поле.
    const cut = Math.max(...hits);
    commit(raw.slice(0, cut));
    setDraft(raw.slice(cut + 1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Со списком Enter принадлежит ему: он подставит выделенный вариант,
      // а без выделения — тот же набранный текст.
      if (suggestions.length > 0) return;
      event.preventDefault();
      commit(draft);
      setDraft('');
      return;
    }
    // Открытый список Escape закрывает сам, и ввод при этом остаётся.
    // В любом случае дальше поля событие не идёт: за ним стоит диалог всего
    // редактора, для которого Escape означает «закрыться».
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!open) setDraft('');
      return;
    }
    // Backspace в пустом поле снимает последний чип — так же, как в почте.
    if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  /**
   * Есть ли у поля значки в углу: карандаш поля и, со списком подсказок,
   * крестик со стрелкой самого списка.
   */
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

  /**
   * Само поле. Со списком подсказок оно живёт внутри `Autocomplete`, и
   * тогда привязку к списку, стрелку и ссылку для всплывающей панели
   * приносит он — их нужно донести до тех же элементов, что и обычно.
   */
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
            {/* Распорка отдаёт значкам место в первой строке и только в ней:
                строку укорачивает всякий обтекаемый блок, который её
                задевает, поэтому распорке хватает пикселя высоты — второй
                строки она уже не касается, и та идёт во всю ширину поля.
                Стоять распорка обязана перед содержимым: блок, встреченный
                посреди строки, отодвигает не её, а следующие за ней. */}
            {reserved > 0 && (
              <Box aria-hidden sx={{ float: 'right', width: `${reserved}px`, height: '1px' }} />
            )}
            {prefix}
            {values.map((value, index) => {
              const valid = isValueValid === undefined || isValueValid(value);
              // Длинное значение обрезается многоточием по краю поля.
              // Прочитать его целиком есть где: окно за карандашом
              // показывает весь список построчным текстом. Невалидному
              // значению название добавляется к подсказке — иначе то,
              // что с ним не так, видно только по цвету.
              // Обёртка со своей подсказкой (теги) native `title` не берёт —
              // иначе браузерная всплывашка перекрывала бы содержимое.
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
                // Ряд стоит в углу поля вне строк — место ему держит
                // распорка. Правый край ряда — это край содержимого поля:
                // от рамки значок отстоит на столько же, на сколько текст.
                position: 'absolute',
                top: `${ROW_PAD}px`,
                right: `${FIELD_ACTION_INSET}px`,
                height: `${ROW_HEIGHT}px`,
                display: 'flex',
                alignItems: 'center',
                // Вертикальные поля кнопкам сбавляет тема: в обычном поле
                // ряд стоит в строке текста и не должен делать поле выше
                // неё. Здесь высоту держит строка, а ряд вынесен из неё —
                // сбавка осталась бы просто сдвигом на полпикселя.
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
          // Отступы и раскладку поля со списком MUI считает сам, и его
          // правила весят три класса — обычному `sx` они не уступают.
          // Раскладка набора чипов повторяет этот вес, иначе поле с
          // подсказками и поле без них разъезжаются по отступам.
          '&.MuiOutlinedInput-root.MuiInputBase-root.MuiInputBase-sizeSmall': {
            position: 'relative',
            // Строки поля — обычные строки текста, а не ряды флексбокса:
            // только их умеет обтекать блок в углу, и только так первая
            // строка кончается перед значками, а все следующие идут во всю
            // ширину. Чипы и поле ввода встают в строку как слова.
            display: 'block',
            minHeight: CONTROL_HEIGHT,
            lineHeight: `${ROW_HEIGHT}px`,
            // Содержимое поле собирает само, поэтому и отступ держит само —
            // иначе его левый край не совпадёт с краем соседних полей.
            // Справа содержимое кончается там, где начинается ряд значков.
            pl: `${FIELD_GUTTER}px`,
            pr: `${hasActions ? FIELD_ACTION_INSET : FIELD_GUTTER}px`,
            py: `${ROW_PAD}px`,
            '& > .MuiChip-root': {
              verticalAlign: 'top',
              mt: `${CHIP_LIFT}px`,
              mr: `${ACTIONS_GAP}px`,
              // Чип шире первой строки обрезается по её краю, а не уезжает
              // под неё целиком, оставляя строку из одних значков. В счёт
              // идёт и просвет справа от самого чипа: строку он занимает
              // так же, как чип, и без него длинный чип в неё не влезает.
              maxWidth: `calc(100% - ${reserved + ACTIONS_GAP}px)`,
            },
            // Поле ввода идёт за последним чипом и переносится вместе с
            // ними. Ширину берёт по набранному — `field-sizing`: строку
            // впустую оно не занимает, а конец длинного значения не прячет.
            '& .MuiInputBase-input': {
              display: 'inline-block',
              verticalAlign: 'top',
              // Высота — в строку: своя высота поля ввода у MUI на пару
              // пикселей ниже, и набранное значение вставало над чипами.
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
      {/* Отступ повторяет собственный селектор MUI: правило «под заголовком
          отступа нет» весит два класса и обычному `sx` не уступает. */}
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
        // Явное `false` MUI понимает как «поле по ширине содержимого»;
        // отсутствие значения оставляет его во всю ширину места в раскладке.
        fullWidth={fullWidth || undefined}
        options={suggestions}
        filterOptions={filterSuggestions}
        groupBy={groupBy}
        renderGroup={renderGroup}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.value)}
        // Значение поля — набор чипов, и живёт оно снаружи. Списку остаётся
        // только очередной ввод, своего выбранного значения у него нет.
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
