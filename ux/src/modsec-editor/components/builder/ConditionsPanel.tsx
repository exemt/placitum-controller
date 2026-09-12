import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';
import { Bracket, BracketLine } from './Bracket';
import { ConditionRow } from './ConditionRow';
import { Counter } from './Counter';
import { Section } from './Section';
import { conditionSummary } from './summary';
import { conditionDiagnostics, worstSeverity } from '../diagnostics/useDiagnostics';
import { useI18n } from '../../i18n/useI18n';
import { makeCondition } from '../../modsec/model';
import type { Diagnostic } from '../../modsec/diagnostics';
import type { VisualCondition } from '../../modsec/model';

interface ConditionsPanelProps {
  conditions: VisualCondition[];
  /** Все замечания правила: панель раздаёт их звеньям по номеру. */
  diagnostics: Diagnostic[];
  onChange: (next: VisualCondition[]) => void;
}

/**
 * Блок «Условия»: все условия правила, объединённые логическим И.
 *
 * В ModSecurity это цепочка `chain` — набор директив `SecRule`, которые
 * срабатывают только все вместе. Скобка И слева показывает именно это.
 */
export function ConditionsPanel({
  conditions,
  diagnostics,
  onChange,
}: ConditionsPanelProps) {
  const { t } = useI18n();

  const replace = (index: number, next: VisualCondition) =>
    onChange(conditions.map((c, i) => (i === index ? next : c)));

  // Свёрнутый блок не должен прятать проблему: счётчик в заголовке говорит,
  // что внутри есть о чём поговорить, и красит себя по худшему из замечаний.
  const inside = conditions.flatMap((_, index) => conditionDiagnostics(diagnostics, index));

  // Свёрнутая цепочка рассказывает о себе строкой: сколько в ней звеньев и
  // что каждое проверяет. Связка И между выжимками — та же, что на скобке
  // внутри, чтобы свёрнутый и развёрнутый вид читались одинаково.
  const preview = conditions.map(conditionSummary).join(`  ${t('builder.and')}  `);

  return (
    <Section
      title={t('builder.conditions')}
      summary={preview}
      monospace
      // Единственный раскрытый блок карточки: условия — то, ради чего правило
      // и открывают, и то, о чём одна строка выжимки говорит меньше всего.
      // Остальные блоки ждут, пока о них спросят.
      defaultExpanded
      counters={
        <>
          <Counter
            hint={t('builder.countConditions', { count: String(conditions.length) })}
            count={conditions.length}
          />
          {inside.length > 0 && (
            <Counter
              hint={t('builder.countConditionNotes', { count: String(inside.length) })}
              count={inside.length}
              severity={worstSeverity(inside)}
            />
          )}
        </>
      }
    >
      <Bracket label={t('builder.and')} color="error.main" line="condition">
        <Stack spacing={1.5}>
          {conditions.map((condition, index) => (
            <ConditionRow
              key={condition.key}
              condition={condition}
              diagnostics={conditionDiagnostics(diagnostics, index)}
              canRemove={conditions.length > 1}
              onChange={(next) => replace(index, next)}
              onRemove={() => onChange(conditions.filter((_, i) => i !== index))}
            />
          ))}

          {/* Кнопка отмечена как звено цепочки: скобка доводится до неё,
              и видно, что добавляется ещё одно условие по И. */}
          <Box sx={{ position: 'relative', display: 'flex' }}>
            <BracketLine name="condition" height="100%" />
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onChange([...conditions, makeCondition()])}
            >
              {t('builder.addCondition')}
            </Button>
          </Box>
        </Stack>
      </Bracket>
    </Section>
  );
}
