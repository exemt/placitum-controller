import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { Bracket, BracketLine } from './Bracket';
import { ChipInput } from './ChipInput';
import { ExclusionTargetRow } from './ExclusionTargetRow';
import { SuggestField } from './SuggestField';
import { TagBrowseHost, TagMark } from './TagMark';
import { PICK_COLUMN, TARGET_COLUMN } from './layout';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import {
  exclusionDirectiveKind,
  exclusionTargetText,
  makeExclusionTarget,
  readExclusionTargets,
  writeExclusionTargets,
} from '../../modsec/exclusions';
import { tagSuggestions, VARIABLE_SUGGESTIONS } from '../../modsec/suggestions';
import type { I18nContextValue } from '../../i18n/context';
import type { TranslationKey } from '../../i18n/translations';
import type { DirectiveForm } from '../../modsec/directives';
import type { ExclusionKind, ExclusionSelector, ExclusionTarget } from '../../modsec/exclusions';

/** Чем подписано поле выборки: номер, сообщение и метка — три разные вещи. */
const PICK_LABEL: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.exclusionPickId',
  msg: 'builder.exclusionPickMsg',
  tag: 'builder.exclusionPickTag',
};

/** Кого директива выбрала — тем же оборотом, каким о ней говорит фраза. */
const WHO: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.exclusionWhoId',
  msg: 'builder.exclusionWhoMsg',
  tag: 'builder.exclusionWhoTag',
};

/** `942100` или `942190-942200`; всё прочее выборкой по номеру не будет. */
const ID_OR_RANGE = /^\d+(-\d+)?$/;

interface ExclusionDirectivePanelProps {
  form: Extract<DirectiveForm, { arg: 'exclusion' }>;
  onChange: (next: DirectiveForm) => void;
}

/**
 * Директива-исключение: кого выбираем и что с выбранными делаем.
 *
 * Что делаем и как выбираем, здесь не спрашивается: это и есть имя
 * директивы, и стоит оно полем выбора в строке над панелью. Пара
 * «что × как» — та же решётка, по которой семь директив и различаются, и
 * задать её дважды значило бы позволить собрать восьмую, которой у
 * ModSecurity нет.
 *
 * Первой строкой стоит фраза о том, что получится, — по той же причине, по
 * которой она стоит у исключения через `ctl`: запись `!ARGS:q` приходится
 * расшифровывать глазами, а ошибка в ней ничем себя не выдаёт. Заодно фраза
 * говорит то, чего в записи нет вовсе: что цель без `!` не снимает проверку,
 * а добавляет её.
 *
 * Дальше идёт то, что вписывают руками, и разделители в нём — главный
 * источник поломок. `SecRuleRemoveById 1 2 3` — три аргумента, а
 * `!ARGS:a|!ARGS:b` — один с вертикальной чертой внутри; перепутанные
 * местами, они меняют смысл строки. Поэтому номера и действия набираются
 * чипами, а цели — той же секцией, что цели правила: разделитель ставит
 * редактор, а не человек.
 */
export function ExclusionDirectivePanel({ form, onChange }: ExclusionDirectivePanelProps) {
  const { t } = useI18n();
  const { tags } = useWorkspace();
  const kind = exclusionDirectiveKind(form.name);
  if (kind === null) return null;

  const { op, selector } = kind;

  // Цели живут в форме строкой файла, а правятся списком: строка — это то,
  // что уходит в текст, и держать рядом с ней второй, разобранный, источник
  // правды значило бы сверять их между собой на каждой правке.
  const targets = op === 'updateTarget' ? readExclusionTargets(form.payload) : [];
  const dropped = targets.filter((target) => target.remove);
  const added = targets.filter((target) => !target.remove);

  // Секция без единого поля отняла бы у цели то место, где её называют, а
  // кнопка «добавить» рядом с пустотой не сказала бы, к чему добавляет.
  const rows = targets.length === 0 ? [makeExclusionTarget('')] : targets;
  const setTargets = (next: ExclusionTarget[]) =>
    onChange({ ...form, payload: writeExclusionTargets(next) });

  // Заменять нечего, когда все цели вычитающие: третий аргумент говорит, на
  // место какой цели встаёт новая, а вычитание ни на чьё место не встаёт.
  const canReplace = added.length > 0;

  return (
    <Stack spacing={1.5}>
      {/* Фраза — про директиву целиком, и ширина у неё вся, какая есть: она
          не поле, а строка текста, и в колонку полей ложилась бы вдвое выше
          без всякой на то причины. */}
      <Typography variant="body2">
        {phrase(t, form, kind, dropped, added)}
      </Typography>

      {/* Поля — одна колонка, и мера у неё та же, что у секции целей: шире
          неё в директиве-исключении нет ничего. Своей ширины у полей нет, они
          берут отведённое, а отведена им была вся карточка — под номер правила
          и слово `ARGS` доставалось поле в тысячу точек. С общей мерой у всех
          строк совпали и левый край, и правый, а та же секция целей читается
          в условии и в директиве одинаково. */}
      <Stack spacing={1.5} sx={{ maxWidth: TARGET_COLUMN }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
        >
          {selector === 'id' ? (
            <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
              <ChipInput
                monospace
                fullWidth
                // Номер снимаемого правила бывает не один, и в файле они стоят
                // через пробел — отдельными аргументами. Чипы делают это
                // видимым: `942100 942110` — два правила, а не одно с дефисом.
                values={form.pick === '' ? [] : form.pick.split(' ')}
                onChange={(ids) => onChange({ ...form, pick: ids.join(' ') })}
                label={t(PICK_LABEL.id)}
                dialogTitle={t(PICK_LABEL.id)}
                separators={[' ', ',']}
                isValueValid={(value) => ID_OR_RANGE.test(value)}
                invalidHint={t('builder.exclusionBadIdHint')}
                error={form.pick === ''}
              />
            </Box>
          ) : (
            <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
              {selector === 'tag' ? (
                <TagBrowseHost>
                  <SuggestField
                    monospace
                    label={t(PICK_LABEL.tag)}
                    suggestions={tagSuggestions(tags)}
                    value={form.pick}
                    onCommit={(pick) => onChange({ ...form, pick })}
                    error={form.pick === '' ? t('builder.exclusionPickRequired') : undefined}
                    optionEnd={(option) => (
                      <TagMark tag={option.value} count={option.badge} />
                    )}
                  />
                </TagBrowseHost>
              ) : (
                <SuggestField
                  monospace
                  label={t(PICK_LABEL[selector])}
                  suggestions={[]}
                  value={form.pick}
                  onCommit={(pick) => onChange({ ...form, pick })}
                  error={form.pick === '' ? t('builder.exclusionPickRequired') : undefined}
                />
              )}
            </Box>
          )}

          {op === 'updateAction' && (
            // Действий приписывают несколько, и места им нужно побольше, чем
            // номеру правила: в узкой колонке `pass,nolog,auditlog` ложится по
            // действию в строку.
            <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
              <ChipInput
                monospace
                fullWidth
                values={form.payload === '' ? [] : form.payload.split(',')}
                onChange={(actions) => onChange({ ...form, payload: actions.join(',') })}
                label={t('builder.exclusionActions')}
                dialogTitle={t('builder.exclusionActions')}
                separators={[',']}
                error={form.payload === ''}
              />
            </Box>
          )}
        </Stack>

        {/* Секция целей — ниже полей, а не рядом с ними: у неё своя высота,
            растущая с каждой правленой целью, и своя ширина — имя параметра
            бывает длиной в строку. Запас сверху — под плавающую подпись первого
            поля, она стоит выше его верхнего края. */}
        {op === 'updateTarget' && (
          <Box sx={{ pt: 1 }}>
            <Bracket label={t('builder.and')} color="error.main" line="target">
              <Stack spacing={2}>
                {rows.map((target, index) => (
                  <ExclusionTargetRow
                    key={`${target.name}-${index}`}
                    target={target}
                    canRemove={rows.length > 1}
                    error={target.name === '' ? t('builder.exclusionTargetRequired') : undefined}
                    onChange={(next) => setTargets(rows.map((v, i) => (i === index ? next : v)))}
                    onRemove={() => setTargets(rows.filter((_, i) => i !== index))}
                  />
                ))}

                {/* Кнопка отмечена как цель: скобка доводится до неё, и видно,
                    что добавляется ещё одна правленая цель, а не что-то рядом. */}
                <Box sx={{ position: 'relative', display: 'flex' }}>
                  <BracketLine name="target" height="100%" />
                  <Tooltip title={t('builder.addExclusionTargetHint')}>
                    <Box component="span" sx={{ display: 'inline-flex' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<AddIcon />}
                        onClick={() => setTargets([...rows, makeExclusionTarget()])}
                      >
                        {t('builder.addExclusionTarget')}
                      </Button>
                    </Box>
                  </Tooltip>
                </Box>
              </Stack>
            </Bracket>
          </Box>
        )}

        {/* Что такое третий аргумент, сказано подсказкой, а не строкой под
            полем: нужно это один раз — пока не знаешь, — а строкой стояло в
            каждой директиве правки целей постоянно и весило больше самого поля.
            Погашенное поле — другое дело: молча пропавшая возможность читается
            поломкой редактора, поэтому причина остаётся на виду. */}
        {op === 'updateTarget' && (
          <Stack spacing={0.5}>
            <Tooltip title={t('builder.exclusionReplacedHint')} placement="top-start">
              <Box sx={{ width: PICK_COLUMN }}>
                <SuggestField
                  monospace
                  // Поле гаснет, только пока оно пустое: запертым оно не дало
                  // бы ни убрать, ни поправить прочитанное из файла.
                  disabled={!canReplace && form.replaced === ''}
                  label={t('builder.exclusionReplaced')}
                  suggestions={VARIABLE_SUGGESTIONS}
                  value={form.replaced}
                  onCommit={(replaced) => onChange({ ...form, replaced })}
                />
              </Box>
            </Tooltip>
            {!canReplace && (
              <Typography variant="caption" color="text.secondary">
                {t('builder.exclusionReplacedBlocked')}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

/**
 * Что директива сделает, одной фразой.
 *
 * Собирается из частей, а не берётся готовой: у правки целей их две — что
 * перестанут проверять и что начнут, — и случаются они обе разом. Фраза,
 * называющая одну из двух, была бы хуже её отсутствия: по ней видно, что
 * редактор запись прочитал, и невидно, что прочитал не всю.
 *
 * Недописанную запись фразой не пересказать — «снять правила ничего» читается
 * как поломка редактора. Поэтому вместо фразы стоит то, чего не хватает, и
 * говорится именно то, чего: выборка и цель чинятся в разных полях.
 */
function phrase(
  t: I18nContextValue['t'],
  form: Extract<DirectiveForm, { arg: 'exclusion' }>,
  kind: ExclusionKind,
  dropped: ExclusionTarget[],
  added: ExclusionTarget[],
): string {
  if (form.pick === '') return t('builder.exclusionIncompletePick');

  const who = t(WHO[kind.selector], { pick: form.pick });
  if (kind.op === 'remove') return t('builder.exclusionSaysRemove', { who });

  if (kind.op === 'updateAction') {
    if (form.payload === '') return t('builder.exclusionIncompleteActions');
    return t('builder.exclusionSaysActions', { who, actions: form.payload });
  }

  if (dropped.length === 0 && added.length === 0) {
    return t('builder.exclusionIncompleteTarget');
  }

  const clauses: string[] = [];
  if (dropped.length > 0) {
    clauses.push(t('builder.exclusionClauseDrop', { targets: exclusionTargetText(dropped) }));
  }
  if (added.length > 0) {
    const targets = exclusionTargetText(added);
    clauses.push(
      form.replaced === ''
        ? t('builder.exclusionClauseAdd', { targets })
        : t('builder.exclusionClauseReplace', { targets, replaced: form.replaced }),
    );
  }

  // Точка с запятой, а не запятая: запятыми внутри клаузы перечислены сами
  // цели, и на общей запятой две правки слились бы в один список.
  return t('builder.exclusionSaysTarget', { who, what: clauses.join('; ') });
}
