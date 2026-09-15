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
  diagnostics: Diagnostic[];
  onChange: (next: VisualCondition[]) => void;
}

export function ConditionsPanel({
  conditions,
  diagnostics,
  onChange,
}: ConditionsPanelProps) {
  const { t } = useI18n();

  const replace = (index: number, next: VisualCondition) =>
    onChange(conditions.map((c, i) => (i === index ? next : c)));

  const inside = conditions.flatMap((_, index) => conditionDiagnostics(diagnostics, index));

  const preview = conditions.map(conditionSummary).join(`  ${t('builder.and')}  `);

  return (
    <Section
      title={t('builder.conditions')}
      summary={preview}
      monospace
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
