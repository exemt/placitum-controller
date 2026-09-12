import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { AddCtlExclusionMenu } from './AddCtlExclusionMenu';
import { Bracket, BracketLine } from './Bracket';
import { Counter } from './Counter';
import { CtlExclusionList } from './CtlExclusionList';
import { ExcludeTargetDialog } from './ExcludeTargetDialog';
import { Section } from './Section';
import { SideTitle } from './SideTitle';
import { DirectivePreview } from '../DirectivePreview';
import { useRuleEffect, useRuleExclusions } from '../diagnostics/useDiagnostics';
import { useEditorView } from '../../context/editorViewContext';
import { useRule } from '../../context/ruleContext';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { ctlExclusionActions, excludeRuleLine, isExclusionCtl } from '../../modsec/exclusions';
import { makeTarget } from '../../modsec/model';
import { serializeAction } from '../../modsec/serialize';
import type { CtlExclusionKind, ExclusionRef } from '../../modsec/exclusions';
import type { VisualRule } from '../../modsec/model';

const MONOSPACE = 'ui-monospace, Consolas, monospace';

/**
 * Всё об исключениях этого правила — в двух направлениях.
 *
 * Направления именно два, и это главное, что секция должна показать. Правило
 * могут снять со стороны — директивой `SecRuleRemoveById` в конце файла; и оно
 * само может снимать другие — действием `ctl` внутри себя. Разница между ними
 * не в записи, а во времени: директива правит конфигурацию при её чтении, раз
 * и навсегда, а `ctl` — одну транзакцию, только на тех запросах, где сработало
 * несущее правило. Разведённые по разным местам карточки, они выглядели как
 * два несвязанных явления, хотя человек приходит сюда с одним вопросом: как
 * перестать ловить это ложное срабатывание.
 *
 * Секция есть у каждого правила, даже когда исключений нет вовсе: починку
 * начинают с того правила, которое сработало, а не с поиска места в конце
 * файла. Внутри она — список: кто правило правит и кого правит оно. Выписывают
 * исключение с полосы, а не изнутри: чтобы завести новое, разворачивать список
 * уже стоящих незачем. Кнопок там две — снять правило целиком и перестать
 * смотреть в одну цель, — и вторая открывает окно с полями
 * ({@link ExcludeTargetDialog}), потому что цель у неё спрашивают.
 *
 * Сторона, на которой ничего нет, не показана вовсе — но только первая. У той,
 * что правило правят со стороны, дела нет: заголовок со словом «никто» под ним
 * занимал бы две строки, чтобы сказать то же, что уже сказал счётчик на полосе
 * своим отсутствием. У второй дело есть — кнопка с меню видов
 * ({@link AddCtlExclusionMenu}), — и она остаётся и на пустом списке.
 *
 * Подписаны стороны, только пока их две. Заголовок отвечает на вопрос «которая
 * из двух», и над единственным списком отвечать ему нечего: над ним уже стоит
 * название секции, а вторая подпись пересказывала бы её же. Поэтому пустая
 * первая сторона забирает заголовки у обеих — в том числе у одинокой кнопки,
 * которой от второй остаётся: к чему она добавляет, сказано на ней самой.
 */
export function ExclusionsSection({
  rule,
  onChange,
}: {
  rule: VisualRule;
  onChange: (next: VisualRule) => void;
}) {
  const { t } = useI18n();
  const { insertLines } = useRule();
  const { revealLine } = useEditorView();
  const { activeId, nameOf } = useWorkspace();
  const effect = useRuleEffect(rule.key);
  const own = useRuleExclusions(rule.headIndex, rule.tailIndex);

  const [excluding, setExcluding] = useState(false);

  // Снятие от сужения строку отличать не приходится: это сказано самой
  // записью, а `SecRuleRemoveById` рядом с `SecRuleUpdateTargetById` читается
  // определённее, чем любая отметка возле них.
  const rows: ExclusionRef[] = [
    ...(effect?.removedBy ?? []),
    ...(effect?.targetEdits ?? []),
    ...(effect?.actionEdits ?? []),
  ];

  // Исключения самого правила берутся из модели, а не из индекса: их правят, а
  // правится только модель. Индекс отвечает на другой вопрос — до кого запись
  // дотянулась в этом файле, — и подставляется к строке отметками.
  const ctls = [rule.actions.extra, ...rule.conditions.slice(1).map((c) => c.extra)]
    .flat()
    .filter(isExclusionCtl);
  const entriesAt = (statementIndex: number) =>
    own.filter((entry) => entry.directive.place.index === statementIndex);

  // Вид исключения приходит из меню кнопки, а не задан заготовкой: он решает,
  // что запись сделает с правилом, и менять его у стоящей строки — значит
  // выбирать задним числом.
  //
  // Место у новой записи одно — последнее звено: в цепочке `ctl` из головы
  // применится, едва совпала голова, а нужно почти всегда «когда совпало всё».
  const addCtl = ({ op, selector }: CtlExclusionKind) => {
    const added = ctlExclusionActions({
      op,
      selector,
      pick: '',
      // У снятого целиком правила цели не бывает вовсе, и пустое поле под ней
      // спрашивало бы то, чего ModSecurity в такой записи не прочитает.
      targets: op === 'removeTarget' ? [makeTarget()] : [],
    });
    const last = rule.conditions.length - 1;
    if (last === 0) {
      onChange({
        ...rule,
        actions: { ...rule.actions, extra: [...rule.actions.extra, ...added] },
      });
      return;
    }
    onChange({
      ...rule,
      conditions: rule.conditions.map((c, i) =>
        i === last ? { ...c, extra: [...c.extra, ...added] } : c,
      ),
    });
  };

  // Исключение ссылается на правило по номеру, поэтому безымянному правилу
  // его не выписать: `SecRuleRemoveById` без номера не значит ничего.
  const id = rule.actions.id;
  const numbered = /^\d+$/.test(id);
  const alreadyOff = (effect?.removedBy ?? []).find((ref) => ref.source === 'directive');

  // Директива обязана стоять ниже своей цели, иначе не сработает вовсе.
  // Сразу за правилом — единственное место, где это верно всегда и где
  // исключение читается вместе с тем, что оно правит.
  const append = (line: string) => insertLines(rule.tailIndex, [line]);

  const total = rows.length + ctls.length;

  // Сторон в секции видно либо две, либо одна: вторая стоит всегда — ради
  // кнопки, — а первая только с записями. Подписи нужны ровно первому случаю.
  const twoSided = rows.length > 0;

  // Список на каждое место, где `ctl` может стоять: действия правила и каждое
  // звено цепочки. Своё место у записи не украшение — от него зависит, при
  // каком из условий исключение случится.
  //
  // Собран отдельно от разметки секции, потому что скобка его только обнимает:
  // содержимое у списка со скобкой и без неё одно и то же, и повторять его
  // двумя ветками значило бы править потом в двух местах.
  const outbound = (
    <Stack spacing={1.5}>
      <CtlExclusionList
        actions={rule.actions.extra}
        entries={entriesAt(rule.conditions[0]?.statementIndex ?? -1)}
        onChange={(extra) => onChange({ ...rule, actions: { ...rule.actions, extra } })}
        link={0}
        links={rule.conditions.length}
      />
      {rule.conditions.slice(1).map((condition, index) => (
        <CtlExclusionList
          key={condition.key}
          actions={condition.extra}
          entries={entriesAt(condition.statementIndex)}
          onChange={(extra) =>
            onChange({
              ...rule,
              conditions: rule.conditions.map((c, i) => (i === index + 1 ? { ...c, extra } : c)),
            })
          }
          link={index + 1}
          links={rule.conditions.length}
        />
      ))}

      {/* Кнопка отмечена как исключение: скобка доводится до неё, и видно, что
          добавляется ещё одно исключение к уже стоящим, а не что-то рядом с
          ними. */}
      <Box sx={{ position: 'relative', display: 'flex' }}>
        <BracketLine name="ctl" height="100%" />
        <AddCtlExclusionMenu onAdd={addCtl} />
      </Box>
    </Stack>
  );

  return (
    <Section
      title={t('builder.exclusions')}
      summary={
        total === 0
          ? t('builder.exclusionsNone')
          : [...rows.map((ref) => ref.text), ...ctls.map(serializeAction)].join('  ')
      }
      monospace={total > 0}
      // Счётчиков два, потому что направления два и путать их нельзя: одно
      // число говорит, сколько исключений правит это правило, другое — сколько
      // оно ставит само. Общей суммой это были бы «два исключения» без ответа
      // на единственный вопрос, с которым сюда приходят: чьё это.
      counters={
        total > 0 ? (
          <>
            {rows.length > 0 && (
              <Counter
                hint={t('builder.countExclusionsInbound', { count: String(rows.length) })}
                count={rows.length}
              />
            )}
            {ctls.length > 0 && (
              <Counter
                hint={t('builder.countExclusionsOutbound', { count: String(ctls.length) })}
                count={ctls.length}
              />
            )}
          </>
        ) : undefined
      }
      // Кнопки стоят на полосе вместе с окном второй: окно всплывает поверх
      // страницы, а место в разметке ему нужно там, где его открывают, — и не
      // внутри секции, содержимое которой свёрнутая полоса отпускает.
      //
      // Кнопок две, потому что решения два и они не равнозначны: снять правило
      // целиком или перестать смотреть в одну цель, оставив остальное в работе.
      // Первое — решение без полей, запись известна по одному номеру правила, и
      // окно, в котором нечего заполнить, спросило бы согласие дважды. Второе
      // без цели не собирается, и цель спрашивает окно. Неравнозначность видна
      // по самим кнопкам: у простого решения формы нет, у бережного она есть.
      actions={
        <>
          <Tooltip
            title={
              !numbered
                ? t('builder.excludeNeedsId')
                : alreadyOff === undefined
                  ? t('builder.excludeRuleHint', { id })
                  : t('builder.excludeRuleDone', { line: String(alreadyOff.line) })
            }
          >
            {/* Выключенной кнопке события не приходят, и подсказка вместе с
                ними: причина отказа нужна именно тогда, когда нажать нельзя. */}
            <Box component="span" sx={{ display: 'inline-flex' }}>
              {/* Чип, а не кнопка: рядом на той же полосе стоят счётчики, и
                  кнопка выше их — на полосе, высота которой задана числом,
                  разница в несколько пикселей читается как сбитая строка. */}
              <Chip
                // Тег остаётся кнопочный: чип здесь не подпись, а действие, и
                // выключен он по-настоящему, а не одним лишь `aria-disabled`.
                component="button"
                size="small"
                color="warning"
                variant="outlined"
                label={t('builder.excludeRule')}
                // Второе снятие ничего не добавит: правило уже не работает, а
                // вторая такая же строка — только шум в файле.
                disabled={!numbered || alreadyOff !== undefined}
                onClick={() => append(excludeRuleLine(id))}
              />
            </Box>
          </Tooltip>

          <Tooltip
            title={numbered ? t('builder.excludeTargetHint', { id }) : t('builder.excludeNeedsId')}
          >
            <Box component="span" sx={{ display: 'inline-flex' }}>
              {/* Цветом мягче снятия: правило остаётся в работе, и разница в
                  цене двух решений держится той же, что была в окне. */}
              <Chip
                component="button"
                size="small"
                color="primary"
                variant="outlined"
                label={t('builder.excludeTarget')}
                disabled={!numbered}
                onClick={() => setExcluding(true)}
              />
            </Box>
          </Tooltip>

          <ExcludeTargetDialog
            open={excluding}
            onClose={() => setExcluding(false)}
            id={id}
            onAppend={append}
          />
        </>
      }
    >
      <Stack spacing={2}>
        {/* Сторона первая: чем это правило снято или переписано. Пустой она не
            показывается вовсе — заголовок со словом «никто» под ним занимал бы
            две строки, чтобы сказать то же, что уже сказано числом на полосе,
            вернее, его отсутствием. */}
        {rows.length > 0 && (
          <Stack spacing={0.75}>
            <SideTitle label={t('builder.exclusionsInbound')} />

            {rows.map((ref, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={1}
                sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}
              >
                {/* Запись — сама себе переход: она стоит в файле блоком, и
                    нажатие ведёт к нему, а не к её копии здесь. Файл при этом
                    может быть другим — исключения набора правят через границу
                    файлов, — и тогда переход сначала открывает его. Превью
                    показывает исходник того же блока. */}
                {ref.key === '' ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={ref.text}
                    sx={{ fontFamily: MONOSPACE }}
                  />
                ) : (
                  <DirectivePreview
                    file={ref.file}
                    blockKey={ref.key}
                    caption={ref.text}
                    chipVariant="outlined"
                    chipSx={{ fontFamily: MONOSPACE }}
                  />
                )}

                {/* Номер строки у правого края — там же, где счётчики полос:
                    в столбик он читается как адрес всей секции, а не как
                    хвост записи разной длины. И это ссылка: в тексте видно
                    то, чего здесь нет, — что стоит вокруг исключения. */}
                <Box sx={{ flex: 1 }} />
                <Tooltip title={t('builder.exclusionRevealLine', { line: String(ref.line) })}>
                  <Link
                    component="button"
                    variant="caption"
                    underline="hover"
                    onClick={() => revealLine(ref.line, ref.file)}
                    sx={{ flexShrink: 0 }}
                  >
                    {/* Чужой файл называется прямо в подписи: «строка 12» из
                        другого файла — самый короткий способ уйти не туда. */}
                    {ref.file === activeId
                      ? t('builder.exclusionAtLine', { line: String(ref.line) })
                      : t('builder.exclusionAtLineIn', {
                          line: String(ref.line),
                          file: nameOf(ref.file),
                        })}
                  </Link>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        )}

        {/* Сторона вторая: что снимает само правило. Показана она и при пустом
            списке — в отличие от первой: в ней кнопка, которой исключение
            заводят, и нужна та ровно тогда, когда исключения ещё нет.

            Разложено как цепочка условий — скобка связки, строка на запись,
            кнопка под ними, — потому что это такой же список, который правят:
            строки добавляют и убирают, и второй способ показать то же самое
            пришлось бы узнавать заново. */}
        <Stack spacing={1.5}>
          {twoSided && (
            <SideTitle
              label={t('builder.exclusionsOutbound')}
              hint={t('builder.exclusionsOutboundHint')}
            />
          )}

          {/* Скобка И — тот самый верхний уровень, без которого связка у целей
              висела бы одна: правило ставит все свои исключения, а не одно из
              них, и вложенная скобка читается как вложенная только рядом с
              внешней. Связка та же, что у целей, потому что и дело то же —
              «все», а не «любое из»: промах одного исключения ничего не говорит
              об остальных.

              Пустой список скобки не получает: связывать нечего, а «И» над
              одинокой кнопкой сказало бы о списке, которого ещё нет. */}
          {ctls.length > 0 ? (
            <Bracket label={t('builder.and')} color="error.main" line="ctl">
              {outbound}
            </Bracket>
          ) : (
            outbound
          )}
        </Stack>
      </Stack>
    </Section>
  );
}
