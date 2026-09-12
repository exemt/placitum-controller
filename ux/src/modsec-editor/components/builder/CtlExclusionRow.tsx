import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { Bracket, BracketLine } from './Bracket';
import { ChoiceField } from './ChoiceField';
import { ExclusionMarks } from './ExclusionMarks';
import { SuggestField } from './SuggestField';
import { TagBrowseHost, TagMark } from './TagMark';
import { TargetRow } from './TargetRow';
import { CONDITION_PADDING, CONDITION_PADDING_TOP, PICK_COLUMN } from './layout';
import { useBuilderView } from '../../context/builderViewContext';
import { useForeignFile } from '../../context/useForeignFile';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { ctlExclusionChoices } from '../../modsec/choices';
import { ctlOption } from '../../modsec/exclusions';
import { makeTarget, targetsToVariables } from '../../modsec/model';
import { serializeVariable } from '../../modsec/serialize';
import { tagSuggestions } from '../../modsec/suggestions';
import type { I18nContextValue } from '../../i18n/context';
import type { TranslationKey } from '../../i18n/translations';
import type {
  CtlExclusion,
  ExclusionEntry,
  ExclusionMatch,
  ExclusionSelector,
} from '../../modsec/exclusions';
import type { VisualTarget } from '../../modsec/model';

interface CtlExclusionRowProps {
  value: CtlExclusion;
  /** Что редактор узнал об этой записи: до кого дотянулась и дотянулась ли. */
  entry?: ExclusionEntry;
  /**
   * Номер звена цепочки, в котором запись стоит; 0 — действия правила.
   *
   * Показывается только у цепочки: у правила из одного условия «звено 1» —
   * уточнение без второй возможности.
   */
  link: number;
  /** Всего звеньев: у последнего условие исключения — «совпала вся цепочка». */
  links: number;
  onChange: (next: CtlExclusion) => void;
  onRemove: () => void;
}

/** Фраза об исключении — по тому, что снимаем и как выбираем. */
const PHRASE: Record<string, TranslationKey> = {
  'remove/id': 'builder.ctlRemoveById',
  'remove/msg': 'builder.ctlRemoveByMsg',
  'remove/tag': 'builder.ctlRemoveByTag',
  'removeTarget/id': 'builder.ctlRemoveTargetById',
  'removeTarget/msg': 'builder.ctlRemoveTargetByMsg',
  'removeTarget/tag': 'builder.ctlRemoveTargetByTag',
};

/** Чем подписано поле выборки: номер, метка и шаблон — три разные вещи. */
const PICK_LABEL: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.ctlPickId',
  msg: 'builder.ctlPickMsg',
  tag: 'builder.ctlPickTag',
};

/**
 * Место выборки во фразе — метка, по которой фраза режется на до и после.
 *
 * Ссылку в переведённую строку иначе не поставить: приходит она целиком, а
 * место номера в ней у каждого языка своё — по-русски он в конце, по-английски
 * в середине. Метку ставит сам перевод, туда, где в шаблоне стоит `{pick}`.
 */
const SLOT = '\u0000';

/**
 * Одно исключение времени запроса: строка `ctl` как форма.
 *
 * Полем, а не текстом, — в отличие от прочих `ctl`. Причина в том, что здесь
 * грамматика известна целиком: шесть значений, у каждого выборка и, у половины,
 * снимаемая цель. Поле, понимающее запись наполовину, было бы хуже её
 * отсутствия; поле, понимающее её полностью, снимает главную сложность таких
 * правил — запись `ruleRemoveTargetByTag=id1515300;REQUEST_HEADERS:Referer`
 * приходится расшифровывать глазами, и ошибка в ней ничем не выдаёт себя.
 *
 * Поэтому первой строкой стоит фраза о том, что исключение делает, а запись
 * собирается из полей под ней. Фраза говорит и то, чего в самой записи нет:
 * в каком звене цепочки она написана, и — ссылкой на месте номера — до какого
 * правила файла дотянулась. Номер в ней тот же, что нашёл редактор, поэтому
 * второй раз, отметкой рядом, он не называется: «не проверять ARGS:q в
 * правиле 90» под руку с «правило: 90» читается заиканием. Не дотянулась,
 * дотянулась слишком поздно или выбирает не номером — об этом по-прежнему
 * говорят отметки: там номера фразой не названы.
 *
 * Цели снимаются той же секцией, что стоит у правила, и по той же причине:
 * снимают их такими же — вся коллекция, перечень параметров, — и второй способ
 * набрать то же самое пришлось бы узнавать заново. Разошлись только связка и
 * два положения. Связка здесь И, а не ИЛИ: цели правила — где искать, любой
 * из них хватит, — а цели исключения снимаются все до одной. А `&` и вычитание
 * отпали вовсе: снимаемую цель ModSecurity сравнивает с целью правила по имени
 * и параметру, и `&ARGS` с `!ARGS:a` не совпадут ни с чем.
 *
 * Строка формы при этом стоит нескольких строк файла: цель в записи `ctl`
 * ровно одна, и каждая следующая — ещё одна запись. Это не вольность
 * редактора, а единственный способ снять две цели, и решение о них человек
 * принимает одно.
 */
export function CtlExclusionRow({
  value,
  entry,
  link,
  links,
  onChange,
  onRemove,
}: CtlExclusionRowProps) {
  const { t } = useI18n();
  const { tags } = useWorkspace();

  // Цель разбирается и собирается тем же кодом, что цели правила: имя
  // параметра бывает с пробелом, и кавычки в нём — не украшение.
  const terms = targetsToVariables(value.targets).filter((term) => term.name !== '');
  // Через запятую, а не через `|`: вертикальной чертой в ModSecurity разделён
  // список целей одного правила, а здесь каждая цель — своя запись.
  const shown = terms.map(serializeVariable).join(', ');

  // Выборка называет ровно то правило, которое редактор и нашёл, — значит
  // номер во фразе можно сделать ссылкой, а отметку с тем же номером убрать.
  // Совпасть так они могут только у выборки по номеру: метка и шаблон
  // сообщения называют признак, а не правило, и найденное по ним фразой не
  // названо.
  const found = entry?.matches ?? [];
  const named =
    value.selector === 'id' && found.length === 1 && found[0].id === value.pick
      ? found[0]
      : undefined;

  // Незаполненное исключение фразой не пересказать: «не проверять ARGS в
  // правиле не задано» читается как поломка редактора, а не как недописанная
  // запись. Поэтому вместо фразы стоит то, чего не хватает, — и говорится
  // именно то, чего: выборка и цель недописаны по-разному и чинятся в разных
  // полях. Звена при этом нет вовсе: у недописанной записи нечему случаться.
  const phrase =
    value.pick === ''
      ? t('builder.ctlIncomplete')
      : value.op === 'removeTarget' && terms.length === 0
        ? t('builder.ctlIncompleteTarget')
        : chained(
            t,
            t(PHRASE[`${value.op}/${value.selector}`], {
              pick: named === undefined ? value.pick : SLOT,
              target: shown,
            }),
            link,
            links,
          );

  // Цели, стоящие в секции: у недописанного исключения — одна пустая. Секция
  // без единого поля отняла бы у него то место, где цель называют, а кнопка
  // «добавить» рядом с пустотой не сказала бы, к чему добавляет.
  const targets = value.targets.length === 0 ? [makeTarget('')] : value.targets;
  const setTargets = (next: VisualTarget[]) => onChange({ ...value, targets: next });

  return (
    // Строка оформлена как звено цепочки: то же поле, тот же фон, та же
    // корзина у правого края. Это и есть одно и то же дело — список, который
    // правят, — и второй способ его показать пришлось бы узнавать заново.
    <Stack
      spacing={0.75}
      sx={{
        p: CONDITION_PADDING,
        pt: CONDITION_PADDING_TOP,
        borderRadius: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ position: 'relative', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}
      >
        {/* Отмечена именно строка фразы, а не карточка целиком: скобка И
            снаружи ставит подпись по строкам, которые обнимает, и по фразам
            она встаёт там же, где у условий — по их первым полям. */}
        <BracketLine name="ctl" height="100%" />

        <Phrase text={phrase} match={named} />

        {entry !== undefined && <ExclusionMarks entry={entry} named={named !== undefined} />}

        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('builder.deleteExclusion')}>
          <IconButton size="small" onClick={onRemove} aria-label={t('builder.deleteExclusion')}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ width: 250 }}>
          <ChoiceField
            label={t('builder.ctlOption')}
            emptyLabel={t('builder.unset')}
            choices={ctlExclusionChoices(ctlOption(value.op, value.selector))}
            value={ctlOption(value.op, value.selector)}
            onChange={(option) => {
              const selector: ExclusionSelector = option.endsWith('ByTag')
                ? 'tag'
                : option.endsWith('ByMsg')
                  ? 'msg'
                  : 'id';
              const op = option.includes('Target') ? 'removeTarget' : 'remove';
              // Снятое правило целями не сужают: цель у такой записи
              // ModSecurity прочитает как мусор в номере.
              onChange({ ...value, op, selector, targets: op === 'remove' ? [] : value.targets });
            }}
          />
        </Box>

        {value.selector === 'tag' ? (
          <TagBrowseHost>
            <SuggestField
              label={t(PICK_LABEL.tag)}
              suggestions={tagSuggestions(tags)}
              value={value.pick}
              onCommit={(pick) => onChange({ ...value, pick })}
              error={value.pick === '' ? t('builder.ctlPickRequired') : undefined}
              optionEnd={(option) => (
                <TagMark tag={option.value} count={option.badge} />
              )}
              sx={{ width: PICK_COLUMN }}
            />
          </TagBrowseHost>
        ) : (
          <SuggestField
            label={t(PICK_LABEL[value.selector])}
            suggestions={[]}
            value={value.pick}
            onCommit={(pick) => onChange({ ...value, pick })}
            error={value.pick === '' ? t('builder.ctlPickRequired') : undefined}
            sx={{ width: PICK_COLUMN }}
          />
        )}
      </Stack>

      {/* Секция целей — ниже полей, а не рядом с ними: у неё своя ширина
          (имя параметра бывает длиной в строку) и своя высота, растущая с
          каждой снятой целью. Запас сверху — под плавающую подпись первого
          поля, она стоит выше его верхнего края. */}
      {value.op === 'removeTarget' && (
        <Box sx={{ pt: 1 }}>
          <Bracket label={t('builder.and')} color="error.main" line="target">
            <Stack spacing={2}>
              {targets.map((target, index) => (
                <TargetRow
                  key={`${target.name}-${index}`}
                  target={target}
                  canRemove={targets.length > 1}
                  error={target.name === '' ? t('builder.ctlTargetRequired') : undefined}
                  countBlocked={t('builder.ctlTargetNoCount')}
                  exceptBlocked={t('builder.ctlTargetNoExcept')}
                  onChange={(next) => setTargets(targets.map((v, i) => (i === index ? next : v)))}
                  onRemove={() => setTargets(targets.filter((_, i) => i !== index))}
                />
              ))}

              {/* Кнопка отмечена как цель: скобка доводится до неё, и видно,
                  что добавляется ещё одна снимаемая цель, а не что-то рядом. */}
              <Box sx={{ position: 'relative', display: 'flex' }}>
                <BracketLine name="target" height="100%" />
                <Tooltip title={t('builder.addCtlTargetHint')}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<AddIcon />}
                      onClick={() => setTargets([...targets, makeTarget()])}
                    >
                      {t('builder.addCtlTarget')}
                    </Button>
                  </Box>
                </Tooltip>
              </Box>
            </Stack>
          </Bracket>
        </Box>
      )}
    </Stack>
  );
}

/**
 * Дописывает фразе звено, в котором исключение стоит.
 *
 * Звено — часть смысла, а не адрес строки: `ctl` из головы применится, едва
 * совпала голова, а из последнего звена — когда совпала вся цепочка. Сказано
 * это словами в самой фразе, а не меткой рядом: метка «звено 3» называет
 * место, но не говорит, что из этого следует, — а следует из этого всё.
 *
 * У правила из одного условия не говорится вовсе: «звено 1» там уточнение без
 * второй возможности.
 */
function chained(
  t: I18nContextValue['t'],
  phrase: string,
  link: number,
  links: number,
): string {
  if (links < 2) return phrase;
  const key = link === links - 1 ? 'builder.ctlPhraseWholeChain' : 'builder.ctlPhraseLink';
  return t(key, { phrase, n: String(link + 1) });
}

/**
 * Фраза об исключении; на месте номера правила — ссылка на само правило.
 *
 * Ссылкой, а не чипом, хотя рядом, у отметок, номера стоят чипами: там они
 * стоят россыпью после подписи, и чип — то, во что можно попасть пальцем, а
 * здесь номер стоит словом внутри предложения, и чип посреди него читался бы
 * ярлыком, приклеенным к фразе, а не её частью.
 *
 * Правило, до которого запись не дотянулась, ссылкой не становится: перейти
 * можно к тому, что есть в файле, а обещание перехода, никуда не ведущего,
 * хуже его отсутствия.
 */
function Phrase({ text, match }: { text: string; match?: ExclusionMatch }) {
  const { t } = useI18n();
  const { revealRule } = useBuilderView();
  const foreign = useForeignFile(match?.file);

  if (match === undefined) return <Typography variant="body2">{text}</Typography>;

  const [before, ...after] = text.split(SLOT);

  return (
    <Typography variant="body2">
      {before}
      <Tooltip
        title={
          foreign === ''
            ? t('builder.exclusionReveal', { id: match.id })
            : t('builder.exclusionRevealIn', { id: match.id, file: foreign })
        }
      >
        <Link
          component="button"
          variant="body2"
          underline="hover"
          onClick={() => revealRule(match.key, match.file)}
          // Сброс кнопки у MUI ставит выравнивание по середине строки: номер
          // сидел бы на пол-буквы выше слов, между которыми стоит.
          sx={{ verticalAlign: 'baseline' }}
        >
          {match.id}
        </Link>
      </Tooltip>
      {after.join(SLOT)}
    </Typography>
  );
}
