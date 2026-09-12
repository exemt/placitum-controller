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
  /** Чем плохо имя переменной: рамка краснеет, причина уходит в подсказку. */
  error?: string;
  /**
   * Почему у цели нет подсчёта `&`, если дело не в самой переменной.
   *
   * У снимаемой цели `ctl` его нет никогда: ModSecurity сравнивает такую цель
   * с целями правила по имени и параметру, и `&ARGS` не совпадёт ни с одной —
   * исключение промолчит.
   */
  countBlocked?: string;
  /**
   * Почему у списка параметров нет положения «ВСЕ, КРОМЕ».
   *
   * Та же причина и то же место: вычитающий терм в цели `ctl` не сравнится
   * ни с чем. Вычитают цель навсегда, директивой `SecRuleUpdateTargetById`.
   */
  exceptBlocked?: string;
}

/**
 * Одна область проверки: переменная, подсчёт и список её параметров.
 *
 * Верстается сеткой в две строки. Сверху — управление: переменная, подсчёт
 * и удаление; все ячейки одной высоты, поэтому кнопки стоят ровно по центру
 * линии полей. Снизу — параметры, ровно под этой строкой и по её краям:
 * область проверки должна читаться прямоугольником, а не лесенкой.
 *
 * Параметры занимают всю ширину не от щедрости: имя параметра бывает длиной
 * в строку, и колонка рядом с переменной ему заведомо мала.
 *
 * Поля гасятся по метаданным переменной: у скаляров вроде `REQUEST_METHOD`
 * параметров нет вовсе, а подсчёт `&` доступен только коллекциям — так
 * конструктор не даёт собрать конструкцию, которая в ModSecurity ничего
 * не значит. По той же причине часть их гасит и место: цель, снимаемая
 * исключением `ctl`, сравнивается по имени и параметру, и ни `&`, ни `!` в
 * ней не совпадут ни с чем — но знает об этом место, а не переменная,
 * поэтому причину отказа оно и передаёт.
 */
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

  // Перечень положений переключателя: вычитание отпадает и там, где параметр
  // обязателен — вычитать из перечня нечего, — и там, где `!` в цели ничего
  // не значит.
  const modes: ParamMode[] =
    support === 'required'
      ? ['only']
      : exceptBlocked === undefined
        ? ['all', 'only', 'except']
        : ['all', 'only'];

  /**
   * Выбранное положение переключателя, пока список пуст.
   *
   * Текст правила — единственный источник правды, и модель конструктора
   * заново собирается из него на каждую правку. Пустые «ТОЛЬКО» и «КРОМЕ»
   * записать в текст нечем: `VAR` без параметров — это вся коллекция, чем
   * бы её ни собирались уточнять. Поэтому выбор до первого значения живёт
   * здесь, иначе переключатель отскакивал бы на «ВСЕ» сразу после нажатия
   * и собрать вычитающую область проверки было бы нечем.
   */
  const [pending, setPending] = useState<ParamMode | null>(null);

  // Параметр обязателен — «ВСЕ» у такой переменной не бывает: без него
  // проверять нечего, и об этом же говорит диагностика `selectorRequired`.
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
    // Вычитание без вычитаемого — та же целая коллекция, и записывается
    // так же: режим цели ждёт первого значения.
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

      {/* Понятное имя переменной живёт в подсказке. Отдельной строкой под
          полем оно стояло в каждой области проверки и занимало место
          постоянно, хотя нужно один раз — пока имя ещё незнакомо. */}
      <Tooltip title={caption} placement="top-start" enterDelay={600}>
        {/* Обёртке подсказки нужен обычный блок: полю она отдаёт всю ширину
            колонки, а флексом сжала бы его до длины имени переменной. */}
        <Box sx={{ minWidth: 0 }}>
          <SuggestField
            required
            label={t('builder.scope')}
            error={error}
            suggestions={VARIABLE_SUGGESTIONS}
            value={target.name}
            onCommit={(name) => {
              // Сбрасываем то, что новая переменная не поддерживает.
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

      {/* Колонка удаления держится пустой у единственной области проверки,
          иначе соседние строки разъезжались бы по горизонтали. */}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        {canRemove && (
          <Tooltip title={t('builder.deleteTarget')}>
            <IconButton size="small" onClick={onRemove}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Список тянется от первой колонки до подсчёта: колонка удаления
          служебная, заходить под неё нельзя, иначе правый край области
          проверки разъезжается со строкой полей.

          Что за список, говорит подпись на рамке — она стоит выше верхнего
          края поля, поэтому строке нужен запас сверху. */}
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
