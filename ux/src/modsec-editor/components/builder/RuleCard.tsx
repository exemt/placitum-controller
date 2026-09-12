import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ActionsPanel } from './ActionsPanel';
import { BlockActions } from './BlockActions';
import { BlockHeader } from './BlockHeader';
import { ConditionsPanel } from './ConditionsPanel';
import { CommitField } from './CommitField';
import { EffectMark } from './EffectMark';
import { ExclusionsSection } from './ExclusionsSection';
import { NotesPanel } from './NotesPanel';
import { conditionSummary } from './summary';
import { RulePreview } from '../RulePreview';
import {
  ruleLevelDiagnostics,
  useRuleDiagnostics,
  useRuleEffect,
} from '../diagnostics/useDiagnostics';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/translations';
import type { ExclusionRef } from '../../modsec/exclusions';
import type { VisualRule } from '../../modsec/model';

interface RuleCardProps {
  rule: VisualRule;
  /**
   * Раскрыта ли карточка.
   *
   * Решает не карточка: раскрытие переживает её саму — правка выше по файлу
   * пересобирает список, а свёрнутая карточка вообще размонтирована.
   */
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (next: VisualRule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** `null`, когда двигать некуда: правило уже первое или последнее. */
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}

/**
 * Однострочная выжимка правила для свёрнутой карточки.
 *
 * Показывает то, по чему правило узнают в списке: где смотрит, что ищет и
 * чем отвечает. Остальные звенья цепочки в строку не влезут, поэтому о них
 * говорится числом.
 *
 * Реакция названа написанием из файла, как и всё остальное в выжимке: строку
 * сверяют с текстовой вкладкой глазами, и `deny` посреди `ARGS @rx attack`
 * читается тем же движением, что и «Запретить» — заново.
 */
function summarize(rule: VisualRule, t: (key: TranslationKey) => string): string {
  const [first] = rule.conditions;
  const parts: string[] = [];

  if (first !== undefined) parts.push(conditionSummary(first));

  const rest = rule.conditions.length - 1;
  if (rest > 0) parts.push(`+${rest} ${t('builder.andMore')}`);
  if (rule.actions.disruptive !== '') parts.push(`→ ${rule.actions.disruptive}`);

  return parts.join('  ');
}

/**
 * Ссылка на исключение, о которой стоит сказать первой.
 *
 * Безусловная правка сильнее условной: `SecRuleRemoveById` снимает правило со
 * всех запросов, `ctl:ruleRemoveById` — только с тех, на которых сработал его
 * носитель. Отметка на карточке одна, и занимать её должна та, что вернее.
 */
function unconditionalFirst(refs: ExclusionRef[] | undefined): ExclusionRef | undefined {
  if (refs === undefined) return undefined;
  return refs.find((ref) => ref.source === 'directive') ?? refs[0];
}

/**
 * Карточка одного логического правила: описание, условия (И-цепочка)
 * и реакция. Всё, что здесь меняется, немедленно пересобирается в текст.
 *
 * Карточку можно свернуть: в файле на десяток правил развёрнуты нужны редко,
 * а листать экран ради соседнего правила — самая частая мелкая морока.
 * Свёрнутая карточка не прячет замечания: их число остаётся в заголовке,
 * иначе проблему можно было бы закрыть от себя нажатием.
 *
 * Свёрнутая — это строка списка, а не форма в одну строку: номер — чип с
 * превью исходника, описание — выжимка. Правят номер в раскрытой карточке,
 * где рядом с полем стоят глаз и переход в текст. Два поля посреди списка
 * обещали бы правку, до которой нельзя дотянуться остальным блокам, а номер
 * правила — не подпись: сменить его значит переадресовать все исключения,
 * которые на него ссылаются, и решают такое, видя правило целиком.
 *
 * Свёрнутое содержимое размонтировано, а не спрятано. Разница видна только на
 * большом файле, зато решающая: одна развёрнутая карточка — около четырёхсот
 * узлов DOM, и файл на тысячу правил, спрятанный, но собранный, кладёт
 * вкладку так же надёжно, как показанный целиком.
 */
export function RuleCard({
  rule,
  expanded,
  onToggleExpanded,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: RuleCardProps) {
  const { t } = useI18n();
  const { activeId } = useWorkspace();
  const description = rule.comments.join(' ');
  const diagnostics = useRuleDiagnostics(rule.key);
  const notes = ruleLevelDiagnostics(diagnostics);

  // Правило могли снять или поправить исключением ниже по файлу. Пока об этом
  // не сказано, карточка показывает правило, которого в работе нет: поля
  // заполнены, реакция выбрана, а на запрос оно не посмотрит.
  //
  // Директива идёт первой не по порядку в файле, а по силе сказанного: она
  // снимает правило для всех запросов, `ctl` — только для тех, на которых
  // сработал его носитель. Если верно и то и другое, говорить надо о первом.
  const effect = useRuleEffect(rule.key);
  const removal = unconditionalFirst(effect?.removedBy);
  const change = unconditionalFirst(effect?.targetEdits) ?? unconditionalFirst(effect?.actionEdits);

  const worst = diagnostics.some((d) => d.severity === 'error')
    ? 'error'
    : diagnostics.some((d) => d.severity === 'warning')
      ? 'warning'
      : 'info';

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <BlockHeader
        toggle={{
          expanded,
          onToggle: onToggleExpanded,
          collapseLabel: 'builder.collapse',
          expandLabel: 'builder.expand',
        }}
        title={
          expanded ? (
            <CommitField
              fullWidth
              value={rule.actions.id}
              onCommit={(id) => onChange({ ...rule, actions: { ...rule.actions, id } })}
              // Подпись поля заодно называет и сам блок: отдельная метка
              // «Правило» рядом с номером повторяла бы то же слово дважды.
              sx={{
                minWidth: 0,
                '& .MuiInputBase-adornedStart .MuiInputBase-input': { pl: 0 },
                '& .MuiInputBase-adornedEnd .MuiInputBase-input': { pr: 0.5 },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">{t('builder.rule')}</InputAdornment>
                  ),
                  // Глаз и текст — те же действия, что у чипа на свёрнутой
                  // строке; чип здесь не дублируем.
                  endAdornment: (
                    <InputAdornment position="end">
                      <RulePreview
                        mode="icons"
                        id={rule.actions.id}
                        file={activeId}
                        ruleKey={rule.key}
                      />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'aria-label': t('builder.ruleId'), inputMode: 'numeric' },
              }}
            />
          ) : (
            // Чип вместо «Правило N»: превью исходника и переход в текст —
            // без раскрытия. Пустой id у документа, который не компилируется:
            // карточка от последней удачной сборки, и «не задано» на чипе
            // честнее пустого места в колонке названий.
            <RulePreview
              preText={t('builder.rule')}
              id={rule.actions.id}
              file={activeId}
              ruleKey={rule.key}
            />
          )
        }
        marks={
          <>
            {/* Отметка видна и у свёрнутой карточки, и у раскрытой: то, что
                правило снято, важнее любого его поля. */}
            {removal !== undefined ? (
              <EffectMark mark={removal} removed />
            ) : (
              change !== undefined && <EffectMark mark={change} removed={false} />
            )}

            {/* Счёт здесь общий — и об условиях, и о правиле: свёрнутая
                карточка не делит замечания по блокам, которых на ней не
                видно. Подсказка говорит об этом прямо, иначе число у края
                полосы остаётся загадкой. */}
            {!expanded && diagnostics.length > 0 && (
              <Tooltip title={t('builder.countAllNotes', { count: String(diagnostics.length) })}>
                <Chip size="small" color={worst} label={diagnostics.length} />
              </Tooltip>
            )}
          </>
        }
        actions={
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            duplicateLabel="builder.duplicateRule"
            deleteLabel="builder.deleteRule"
          />
        }
      >
        {expanded ? (
          <CommitField
            fullWidth
            placeholder={t('builder.descriptionPlaceholder')}
            value={description}
            onCommit={(value) =>
              onChange({ ...rule, comments: value.trim() === '' ? [] : [value.trim()] })
            }
            slotProps={{ htmlInput: { 'aria-label': t('builder.description') } }}
          />
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
            noWrap
          >
            {description === '' ? summarize(rule, t) : description}
          </Typography>
        )}
      </BlockHeader>

      {/* Черту под шапкой рисует первый блок своей верхней границей: у
          блоков она одна на всех, и вторая линия здесь легла бы поверх неё. */}
      <Collapse in={expanded} unmountOnExit>
        <Box>
          <ConditionsPanel
            conditions={rule.conditions}
            diagnostics={diagnostics}
            onChange={(conditions) => onChange({ ...rule, conditions })}
          />
          <ActionsPanel
            hideId
            actions={rule.actions}
            onChange={(actions) => onChange({ ...rule, actions })}
          />
          <ExclusionsSection rule={rule} onChange={onChange} />
          <NotesPanel notes={notes} />
        </Box>
      </Collapse>
    </Paper>
  );
}
