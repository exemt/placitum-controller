import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BlockActions } from './BlockActions';
import { BlockHeader, BlockTitle } from './BlockHeader';
import { ChoiceField } from './ChoiceField';
import { DirectivePanel } from './DirectivePanel';
import { ExclusionMarks } from './ExclusionMarks';
import { LongTextField } from './LongTextField';
import { SECTION_PADDING } from './Section';
import { SuggestField } from './SuggestField';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { directiveValueChoices } from '../../modsec/choices';
import {
  directiveIssues,
  directiveMeta,
  emitDirective,
  isPanelArg,
} from '../../modsec/directives';
import type { TranslationKey } from '../../i18n/translations';
import type { DirectiveForm, DirectiveIssue } from '../../modsec/directives';
import type { ExclusionEntry } from '../../modsec/exclusions';

const MONO = 'ui-monospace, Consolas, monospace';

/** Чем объясняется красное поле. */
const ISSUE_LABEL: Record<DirectiveIssue['code'], TranslationKey> = {
  directiveValueMissing: 'builder.directiveValueMissing',
  directiveBadValue: 'builder.directiveBadValue',
  directiveNotNumber: 'builder.directiveNotNumber',
  directiveUnknownFlag: 'builder.directiveUnknownFlag',
};

interface DirectiveRowProps {
  form: DirectiveForm;
  /** Исключение, если директива снимает правила: до кого дотянулась. */
  exclusion?: ExclusionEntry;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (next: DirectiveForm) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Директива конфигурации как форма.
 *
 * Имя стоит слева заголовком блока, как номер у карточки правила, и не
 * правится: сменить имя — значит завести другую директиву, у которой свой вид
 * аргумента, и набранное в форме пришлось бы выбросить. Такое решение
 * принимают не полем в общем ряду, а удалением строки и новой строкой рядом;
 * имя выбирают один раз, когда её заводят.
 *
 * Написано имя так, как в файле, а не человеческой подписью: `SecRuleEngine`
 * под «Движком правил» пришлось бы сверять с текстовой вкладкой по памяти.
 * Подпись с пояснением остаётся в подсказке — там ей место есть, а колонка
 * заголовка отдана целиком написанию, чтобы самые длинные имена не обрывались.
 *
 * Справа от имени — то, что директива принимает, и вид у этого свой на
 * каждый вид аргумента: закрытый список у переключателя, число у предела,
 * окно с проверкой у регулярного выражения. Директивы, чья форма за одну
 * строку не ручается, раскрываются панелью — так же, как правило.
 *
 * Значка «снимает» или «правит» у исключения тут нет: то же самое сказано
 * словами в этой же строке — `SecRuleRemoveById` от `SecRuleUpdateTargetById`
 * отличается написанием, а не картинкой. Справа остаётся только то, чего в
 * строке не видно: номера правил, до которых директива дотянулась.
 */
export function DirectiveRow({
  form,
  exclusion,
  expanded,
  onToggleExpanded,
  onChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: DirectiveRowProps) {
  const panel = isPanelArg(form.arg);

  // Выжимка свёрнутой панели — сама директива без имени: имя уже стоит
  // заголовком слева, и повторённое оно съедало бы место у того, ради чего
  // строку и читают.
  const summary = emitDirective(form).slice(form.name.length).trim();

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <BlockHeader
        toggle={
          panel
            ? {
                expanded,
                onToggle: onToggleExpanded,
                collapseLabel: 'builder.collapseBlock',
                expandLabel: 'builder.expandBlock',
              }
            : null
        }
        title={<DirectiveName name={form.name} />}
        marks={exclusion !== undefined && <ExclusionMarks entry={exclusion} />}
        actions={
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            duplicateLabel="builder.duplicateLine"
            deleteLabel="builder.deleteLine"
          />
        }
      >
        {panel ? (
          expanded ? null : (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ fontFamily: MONO }}>
              {summary}
            </Typography>
          )
        ) : (
          <DirectiveValue form={form} onChange={onChange} />
        )}
      </BlockHeader>

      {panel && (
        <Collapse in={expanded} unmountOnExit>
          <Divider />
          <Box sx={{ p: SECTION_PADDING }}>
            <DirectivePanel form={form} onChange={onChange} />
          </Box>
        </Collapse>
      )}
    </Paper>
  );
}

/**
 * Имя директивы — заголовок блока.
 *
 * Написание из файла и ничего кроме: слово «директива» перед ним отняло бы у
 * колонки четверть, а самые длинные имена — `SecResponseBodyMimeTypesClear` —
 * укладываются в неё ровно целиком. Что это за директива и что она делает,
 * говорит подсказка; она же остаётся описанием для чтения с экрана, а не
 * подменяет собой само имя.
 */
function DirectiveName({ name }: { name: string }) {
  const localize = useLabel();
  const meta = directiveMeta(name);
  const hint =
    meta === null ? '' : `${localize(meta.label, name)} — ${localize(meta.note, '')}`;

  return (
    <BlockTitle monospace hint={hint}>
      {name}
    </BlockTitle>
  );
}

/**
 * Значение однозначной директивы — одно поле по виду аргумента.
 *
 * Вид определяет не оформление, а то, что вообще можно набрать: у
 * переключателя список закрыт, у предела принимается только число, у
 * регулярного выражения есть окно с проверкой.
 *
 * Тем же полем директиву заводят: окно новой директивы спрашивает значение до
 * того, как строка появилась в файле, и спрашивать его вторым, отдельно
 * написанным полем значило бы завести второй ответ на вопрос «что тут можно
 * набрать».
 */
export function DirectiveValue({
  form,
  onChange,
}: {
  form: DirectiveForm;
  onChange: (next: DirectiveForm) => void;
}) {
  const { t } = useI18n();
  const localize = useLabel();
  const meta = directiveMeta(form.name);

  switch (form.arg) {
    // Раскрывающиеся виды сюда не приходят — их забрала панель. Ветка стоит
    // не для верности, а ради сужения типа: ниже у формы есть поле
    // `value`, и знать об этом должен компилятор, а не только автор.
    case 'flags':
    case 'list':
    case 'actions':
    case 'exclusion':
      return null;

    // Директива без аргумента оставляет место пустым и говорит об этом
    // словами: пустая половина строки читалась бы как недогрузившееся поле.
    case 'none':
      return (
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {t('builder.directiveNoArgument')}
        </Typography>
      );

    default:
      break;
  }

  const { value } = form;
  const set = (next: string) => onChange({ ...form, value: next });

  const issue = directiveIssues(form)[0];
  const error =
    issue === undefined
      ? undefined
      : t(ISSUE_LABEL[issue.code], { value: issue.value });

  // Единица входит в подпись поля: `13107200` рядом с «Пределом тела
  // запроса» ничего не говорит, а рядом с «в байтах» — говорит всё.
  const unit = meta?.unit === undefined ? '' : `, ${localize(meta.unit, '')}`;
  const label = `${localize(meta?.label, t('builder.directiveValue'))}${unit}`;
  const suggestions = (meta?.hints ?? []).map((entry) => ({
    value: entry.value,
    hint: entry.hint,
  }));

  if (form.arg === 'toggle' || form.arg === 'enum') {
    return (
      <ValueColumn>
        <ChoiceField
          raw
          label={label}
          value={value}
          choices={directiveValueChoices(form.name, value)}
          onChange={set}
          error={error}
        />
      </ValueColumn>
    );
  }

  if (form.arg === 'regex') {
    return (
      <ValueColumn>
        <LongTextField
          fullWidth
          regex
          monospace
          label={label}
          dialogTitle={label}
          value={value}
          onCommit={set}
          suggestions={suggestions}
        />
      </ValueColumn>
    );
  }

  return (
    <ValueColumn>
      <SuggestField
        fullWidth
        monospace
        label={label}
        value={value}
        onCommit={set}
        suggestions={suggestions}
        error={error}
      />
    </ValueColumn>
  );
}

/**
 * Место значения в строке директивы: всё, что осталось от ряда после имени.
 *
 * Растяжку держит обёртка, а не само поле, и это не лишний узел. Наружу у
 * поля с выпадающим списком смотрит корень списка, а `sx` уходит внутрь, к
 * полю ввода, — заданная полю растяжка досталась бы не тому узлу, который
 * стоит в ряду, и поле сжималось бы до собственной ширины. Ровно это и
 * случилось: предел тела запроса показывал `13…` вместо `13107200`, а
 * соседний переключатель, у которого обёртка была, занимал ряд целиком.
 *
 * Обёртка одна на все три вида поля, потому что колонка у них одна: строка
 * директивы читается как строка таблицы, и вертикали в ней не должны
 * зависеть от того, каким полем правится аргумент.
 */
function ValueColumn({ children }: { children: ReactNode }) {
  return <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>;
}
