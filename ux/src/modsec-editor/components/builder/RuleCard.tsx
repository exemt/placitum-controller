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
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (next: VisualRule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}

function summarize(rule: VisualRule, t: (key: TranslationKey) => string): string {
  const [first] = rule.conditions;
  const parts: string[] = [];

  if (first !== undefined) parts.push(conditionSummary(first));

  const rest = rule.conditions.length - 1;
  if (rest > 0) parts.push(`+${rest} ${t('builder.andMore')}`);
  if (rule.actions.disruptive !== '') parts.push(`→ ${rule.actions.disruptive}`);

  return parts.join('  ');
}

function unconditionalFirst(refs: ExclusionRef[] | undefined): ExclusionRef | undefined {
  if (refs === undefined) return undefined;
  return refs.find((ref) => ref.source === 'directive') ?? refs[0];
}

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
            {removal !== undefined ? (
              <EffectMark mark={removal} removed />
            ) : (
              change !== undefined && <EffectMark mark={change} removed={false} />
            )}

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
