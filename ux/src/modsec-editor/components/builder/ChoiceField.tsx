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

/**
 * Отбор по набранному тексту.
 *
 * Ищем сразу по всему, что показано в строке: по имени из правила, по
 * названию и по пояснению, на обоих языках. Тот, кто помнит только «убрать
 * пробелы», наберёт это — и найдёт `compressWhitespace`, не зная слова.
 */
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
  /** Подпись поля. */
  label: string;
  /** Выбранное имя; пустая строка — не выбрано. */
  value: string;
  choices: Choice[];
  onChange: (next: string) => void;
  /**
   * Приставка, с которой имя попадает в правило: `t:` или `@`. Показывается
   * рядом с вариантом, чтобы список читался как будущий текст правила.
   */
  prefix?: string;
  /** Текст на месте пустого значения; задан — значение можно не выбирать. */
  emptyLabel?: string;
  /**
   * В самом поле стоит написание из правила, а не человеческая подпись.
   *
   * Нужно там, где выбранное — это и есть то, что написано в файле:
   * имя директивы под «Изменить цели по номеру» пришлось бы сверять с
   * текстовой вкладкой по памяти. В открытом списке подпись остаётся —
   * там места хватает на обе, и выбирают как раз по ней.
   */
  raw?: boolean;
  /**
   * Что с полем не так. Задан — поле подсвечено красным, а текст стоит на
   * месте незаполненного значения и повторяется в подсказке. Годится и
   * недоступному полю: погашенное значение может быть не пустым, а негодным.
   */
  error?: string;
  /**
   * Забрать фокус сразу: поле только что появилось по действию человека.
   * Список при этом остаётся закрытым — открывают его клик и набранное.
   */
  autoFocus?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Оформление самого значения — цвет и начертание. */
  inputSx?: Record<string, unknown>;
  sx?: Record<string, unknown>;
}

/**
 * Поле выбора из базы знаний ModSecurity.
 *
 * Заменяет собой выпадающий список там, где вариантов несколько десятков и
 * все они выглядят одинаково важными. Отличий от обычного списка три.
 *
 * Первое — поиск. Полсотни строк глазами не просматривают, а печатать
 * человек умеет; поле ищет и по имени из правила, и по пояснению.
 *
 * Второе — строка варианта отвечает сразу на два вопроса: как это пишется
 * в правиле (моноширинный оригинал справа) и что оно делает (пояснение
 * снизу). Без первого выбор нельзя сверить с текстовой вкладкой, без
 * второго — сделать, не зная ModSecurity наизусть.
 *
 * Третье — список отобран под текущую проверку. Наверху то, что здесь
 * обычно и ставят, ниже остальное применимое, в самом низу — то, что к
 * этому значению не подходит, с объяснением почему. Краткий вид оставляет
 * только частое; кнопка внизу списка разворачивает его целиком.
 */
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
  // Пока в поле стоит подставленное значение, отбирать по нему нечего:
  // иначе открытый список показывал бы ровно то, что уже выбрано.
  const [query, setQuery] = useState('');

  const selected = choices.find((choice) => choice.value === value) ?? null;

  /** Краткий вид: только уместное здесь, частое и уже выбранное. */
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

  // Краткий вид имеет смысл только там, где он что-то прячет. У закрытого
  // списка — скажем, семи реакций правила — частое и есть весь список:
  // подвал предлагал бы «показать все, ещё 0», а звёздочка «часто» стояла бы
  // у каждой строки и ни одной не выделяла.
  const shortens = hidden > 0;

  /**
   * Цвет каждого раздела — по тому, чем в нём варианты.
   *
   * Разделы приходят готовыми строками, и по названию отличить «подходит»
   * от «не подходит» можно было бы только сравнением с переводом. Сами
   * варианты знают о себе больше: `shelve` уже разложила их так, что
   * раздел однороден, поэтому достаточно первого встречного.
   */
  const tones = useMemo(() => {
    const map = new Map<string, SectionTone>();
    for (const choice of choices) {
      const name = localize(choice.group, '');
      if (map.has(name)) continue;
      map.set(name, choice.unfit !== null ? 'unfit' : choice.recommended ? 'fit' : 'plain');
    }
    return map;
  }, [choices, localize]);

  // Заголовок раздела нужен, чтобы отделить один раздел от другого. Когда
  // раздел на весь список один — как у пары «писать / не писать», — отделять
  // его не от чего, и полоса лишь повторяла бы подпись поля.
  const sectioned = tones.size > 1;

  // Подвал списка перерисовывается вместе с полем, а его компонент обязан
  // сохранять тождество: пересоздание размонтировало бы открытый список.
  // Поэтому меняющиеся данные подвал читает из ссылки, а не из замыкания.
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
              // Нажатие не должно уводить фокус из поля, иначе список
              // закроется раньше, чем сработает переключение.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setFullList(!state.full)}
              // Подвал — служебная полоса под списком, а не главное в нём:
              // набранная во всю ширину цветом кнопки, она перетягивала
              // внимание с вариантов, ради которых список открыт. Цвет
              // остался за значком: по нему полосу видно как нажимаемую.
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

  /**
   * Оформление поля поверх готового: серое недоступное и красное негодное
   * в MUI сходятся в одном поле не сами.
   *
   * Красный приходится возвращать вручную: в стилях MUI правило
   * `.Mui-disabled` стоит после `.Mui-error` и перебивает его, так что
   * негодное значение выглядело бы просто недоступным.
   *
   * А подсказка иначе не всплывает над самим значением: событий мыши
   * недоступное поле не получает, и наведение доходило бы только до рамки
   * вокруг него. Пропущенное сквозь поле, оно достаётся обёртке, на которой
   * подсказка и висит.
   */
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
      // По фокусу список открывается — кроме того фокуса, который поле
      // забрало само: окно, показавшееся с уже раскрытым списком, прячет за
      // ним и заголовок, и подпись поля, то есть то, что человек как раз
      // пришёл прочитать. Клик и первая набранная буква открывают список
      // по-прежнему, так что лишнего действия это не добавляет.
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
      // Поиск идёт по всему списку, даже когда он свёрнут: спрашивая про
      // `base64`, человек хочет получить ответ, а не «ничего не найдено»
      // из-за режима показа.
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
      // Ключ строки — имя из правила, а не подпись, которую подставил бы
      // список: у синонимов вроде `normalizePath` и `normalisePath` подпись
      // одна на двоих, и React увидел бы два одинаковых ключа.
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
    // С открытым списком подсказка гасится пустым заголовком, а не запретом
    // наведения: наведение случилось раньше открытия, и запрет уже
    // показанную подсказку не убирает — она так и висит поверх списка.
    <Tooltip title={open ? '' : hint} placement="top-start" enterDelay={600}>
      {/* Подсказке нужен обычный блок: полю она отдаёт всю ширину колонки,
          а флексом сжала бы его до длины названия. */}
      <Box sx={{ minWidth: 0 }}>{field}</Box>
    </Tooltip>
  );
}

/** Подсказка к закрытому полю: как это пишется в правиле и что означает. */
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
  /** Пометить вариант как частый — только в развёрнутом списке. */
  marked: boolean;
}

/**
 * Строка списка: название, оригинал, пояснение.
 *
 * Название слева и человеческое — по нему выбирают. Оригинал справа и
 * моноширинный — по нему потом ищут строку в текстовой вкладке. Пояснение
 * снизу и переносится: обрезать его нечестно, ради него список и открыли.
 */
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

          {/* Частое отмечено звёздочкой сразу за названием: словом «часто»
              эта пометка занимала в строке столько же места, сколько само
              название, и читалась как часть смысла варианта. */}
          {marked && (
            <Tooltip title={t('builder.choiceOften')} placement="top" enterDelay={400}>
              <StarRateRoundedIcon
                sx={{ flexShrink: 0, fontSize: 15, color: 'success.main' }}
              />
            </Tooltip>
          )}

          {/* Распорка прижимает оригинал к правому краю и при этом сжимается
              последней: не хватает места — многоточие получает название. */}
          <Box sx={{ flex: 1, minWidth: 8 }} />

          <Typography
            variant="caption"
            sx={{
              flexShrink: 0,
              fontFamily: MONO,
              // Написание из правила — вставка чужого языка, и подложка
              // отделяет его от подписей интерфейса так же, как код в тексте.
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
