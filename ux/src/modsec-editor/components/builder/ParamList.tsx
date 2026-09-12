import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { ChipInput } from './ChipInput';
import { useI18n } from '../../i18n/useI18n';
import type { Suggestion } from '../../modsec/suggestions';

/**
 * Положение переключателя списка.
 *
 * `all` — параметры не перечислены, проверяется вся коллекция; `only` —
 * только перечисленные; `except` — вся коллекция без перечисленных.
 *
 * В модели правила такого перечисления нет: там всего два способа собрать
 * список термов, а «ВСЕ» — это пустой перечень. Переключателю же нужно
 * третье положение отдельно от двух других, потому что выбирают его раньше,
 * чем набирают значения.
 */
export type ParamMode = 'all' | 'only' | 'except';

interface ParamListProps {
  mode: ParamMode;
  values: string[];
  /** Режим и значения меняются вместе: по отдельности они не имеют смысла. */
  onChange: (next: { mode: ParamMode; values: string[] }) => void;
  /** Готовые имена параметров этой переменной. */
  suggestions?: Suggestion[];
  /**
   * Положения, которые переключатель перебирает.
   *
   * Их не всегда три: у переменной с обязательным параметром вычитать не из
   * чего, а у цели исключения `!` не сравнится ни с чем. Недоступное
   * положение поэтому не показывается вовсе, а причину, по которой его нет,
   * говорит {@link ParamListProps.note} — молча укороченный перебор читался
   * бы поломкой переключателя.
   */
  modes?: ParamMode[];
  /** Чего у переключателя нет и почему — строкой в его подсказке. */
  note?: string;
  /**
   * Что значит пустой список, если он не про проверку коллекции.
   *
   * Пустое «ВСЕ» у условия значит «проверяется вся коллекция», а у списка,
   * которым цель вычитают, — «снимается вся коллекция». Слово тут одно, а дела
   * разные, и знает о разнице то место, где список стоит.
   */
  allNote?: string;
  /**
   * Чем плоха пустота выбранного положения, если дело не в проверке коллекции.
   *
   * В условии правила пустое «ТОЛЬКО» значит, что проверяется вся коллекция.
   * У списка, который не проверяет, а вычитает, то же положение значит другое —
   * и сказать об этом должно то место, которое знает, что тут собирают.
   */
  requiredNote?: string;
  /** Положительной части у цели нет — список только вычитает. */
  baseless?: boolean;
}

/**
 * Параметры области проверки одним списком.
 *
 * В ModSecurity список переменных — это последовательность термов, которую
 * движок применяет слева направо: `VAR:a` добавляет элемент коллекции,
 * `!VAR:a` вычитает. Осмысленных способов уточнить переменную поэтому ровно
 * два, и они исключают друг друга: либо перечислить параметры, либо взять
 * всю коллекцию без перечисленных. Двух отдельных полей это не требует —
 * требует одного поля и переключателя.
 *
 * Переключатель — первый чип в поле, и он же отвечает на вопрос, который
 * при двух полях оставался без ответа: что будет, если не указать ничего.
 * Пустой список читается «ВСЕ», то есть вся коллекция, и это видно до
 * первого ввода, а не выясняется опытным путём.
 *
 * Положений у него три там, где все три что-то значат, и переключаются они и
 * на пустом списке: режим выбирают до того, как набрали значения, а не после.
 * Пустые «ТОЛЬКО» и «КРОМЕ» — состояние незаконченное, поэтому поле в нём
 * подсвечено: правило пока проверяет всю коллекцию, что бы ни было написано
 * на переключателе.
 *
 * Имена параметров бывают длиной в строку — такой чип обрезается по ширине
 * поля, а целиком значение показывают подсказка и окно правки. Окно заодно
 * остаётся способом вставить или переписать сразу весь список.
 */
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
  // Режим выбран, а перечислять нечего: правило проверяет всю коллекцию,
  // а не то, что написано на переключателе.
  const incomplete = !baseless && mode !== 'all' && values.length === 0;
  const requiredText = requiredNote ?? t('builder.paramsRequired');

  /**
   * Список сам возвращает переключатель в «ВСЕ», когда снят последний чип,
   * и уводит из него, когда появился первый: пустой перечень и есть вся
   * коллекция. Осознанно пустыми бывают только «ТОЛЬКО» и «КРОМЕ»,
   * выставленные нажатием на сам переключатель.
   */
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

  // Пустой список перебирает все доступные положения; с непустым «ВСЕ»
  // пропускается — одно нажатие не должно стирать набранный перечень.
  const order = values.length === 0 ? modes : modes.filter((m) => m !== 'all');
  const nextMode = order[(order.indexOf(mode) + 1) % order.length];

  // Вычитать без положительной части не из чего, поэтому такую цель не
  // переключают: её и собрал не конструктор, а чужой текст правила. Единственное
  // доступное положение — тоже не переключатель, а подпись, и нажиматься она не
  // должна: нажатие, ничего не меняющее, читается поломкой.
  const switchable = !baseless && order.length > 1;

  const modeChip = (
    // Подсказка именно поясняет чип, а не называет его: имя у чипа своё,
    // видимое. Без `describeChild` MUI подменил бы им имя целиком, и чип
    // перестал бы называться тем словом, которое на нём написано.
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
          {/* «ВСЕ» выпало из перебора именно потому, что список непуст, —
              и вернуть его можно, очистив список, а не переключателем. */}
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
        // Нажатие на чип не должно уводить каретку в поле и раскрывать
        // список подсказок: это переключатель, а не начало ввода. Поле
        // ловит и нажатие, и клик, поэтому гасить нужно оба.
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
