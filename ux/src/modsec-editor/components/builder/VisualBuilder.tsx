import { useEffect, useRef } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ActionsPanel } from './ActionsPanel';
import { BlockActions } from './BlockActions';
import { BlockHeader } from './BlockHeader';
import { BlockList } from './BlockList';
import { CommitField } from './CommitField';
import { DirectiveRow } from './DirectiveRow';
import { ExclusionMarks } from './ExclusionMarks';
import { exclusionIcon, exclusionOpKey } from './exclusionLabels';
import { RuleCard } from './RuleCard';
import { StatementRow } from './StatementRow';
import { MarkerPreview } from '../MarkerPreview';
import { RulePreview } from '../RulePreview';
import { MarkerMark } from './MarkerMark';
import { actionSummary } from './summary';
import { useRuleExclusions } from '../diagnostics/useDiagnostics';
import { useRule } from '../../context/ruleContext';
import { useWorkspace } from '../../context/workspaceContext';
import { blockExpansionKey, useBuilderView } from '../../context/builderViewContext';
import { useI18n } from '../../i18n/useI18n';
import { emitDirective } from '../../modsec/directives';
import { emitActionBlock } from '../../modsec/emit';
import { blockRange } from '../../modsec/model';
import { statementRef } from '../../modsec/workspace';
import type { VisualActions, VisualBlock, VisualModel } from '../../modsec/model';

function ActionCard({
  block,
  expanded,
  onToggleExpanded,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  block: Extract<VisualBlock, { kind: 'action' }>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (actions: VisualActions) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { activeId } = useWorkspace();
  const exclusions = useRuleExclusions(block.statementIndex, block.statementIndex);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <BlockHeader
        toggle={{
          expanded,
          onToggle: onToggleExpanded,
          collapseLabel: 'builder.collapseBlock',
          expandLabel: 'builder.expandBlock',
        }}
        title={
          expanded ? (
            <CommitField
              fullWidth
              value={block.actions.id}
              onCommit={(id) => onChange({ ...block.actions, id })}
              sx={{
                minWidth: 0,
                '& .MuiInputBase-adornedStart .MuiInputBase-input': { pl: 0 },
                '& .MuiInputBase-adornedEnd .MuiInputBase-input': { pr: 0.5 },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">{t('builder.secAction')}</InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <RulePreview
                        mode="icons"
                        id={block.actions.id}
                        file={activeId}
                        ruleKey={block.key}
                      />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'aria-label': t('builder.ruleId'), inputMode: 'numeric' },
              }}
            />
          ) : (
            <RulePreview
              preText={t('builder.secAction')}
              id={block.actions.id}
              file={activeId}
              ruleKey={block.key}
            />
          )
        }
        actions={
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
            deleteLabel="builder.deleteBlock"
          />
        }
      >
        {expanded ? null : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
            noWrap
          >
            {block.comments.join(' ') || actionSummary(block.actions)}
          </Typography>
        )}
      </BlockHeader>
      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <ActionsPanel
          alwaysExpanded
          hideId
          actions={block.actions}
          exclusions={exclusions}
          onChange={onChange}
        />
      </Collapse>
    </Paper>
  );
}

export function VisualBuilder() {
  const { t } = useI18n();
  const { compiled, updateRule, replaceLines, removeBlock, duplicateRule, swapBlocks } =
    useRule();
  const { isExpanded, toggleExpanded, expandNext, reveal } = useBuilderView();
  const { exclusions, activeId } = useWorkspace();

  const exclusionAt = (statementIndex: number) =>
    exclusions.byStatement.get(statementRef(activeId, statementIndex))?.[0];

  const lastGood = useRef<VisualModel | null>(null);
  useEffect(() => {
    if (compiled.model) lastGood.current = compiled.model;
  }, [compiled.model]);

  const model = compiled.model ?? lastGood.current;

  const blocks = model?.blocks ?? [];

  const swapWith = (index: number, delta: number) => {
    const neighbour = blocks[index + delta];
    if (neighbour === undefined) return null;
    return () => swapBlocks(blockRange(blocks[index]), blockRange(neighbour));
  };

  const isOpen = (index: number) => {
    const key = blockExpansionKey(blocks[index]);
    return key !== null && isExpanded(key);
  };

  const commitStatement = (statementIndex: number, text: string) =>
    replaceLines(statementIndex, statementIndex, [text]);

  const duplicateStatement = (statementIndex: number, text: string) =>
    replaceLines(statementIndex, statementIndex, [text, text]);

  const renderBlock = (index: number) => {
    const block = blocks[index];
    const key = blockExpansionKey(block);
    const expanded = key !== null && isExpanded(key);
    const toggle = () => key !== null && toggleExpanded(key);

    switch (block.kind) {
      case 'rule':
        return (
          <RuleCard
            key={block.key}
            rule={block.rule}
            expanded={expanded}
            onToggleExpanded={toggle}
            onChange={updateRule}
            onDelete={() => removeBlock(block.rule.startIndex, block.rule.tailIndex)}
            onDuplicate={() => {
              expandNext();
              duplicateRule(block.rule);
            }}
            onMoveUp={swapWith(index, -1)}
            onMoveDown={swapWith(index, 1)}
          />
        );
      case 'action':
        return (
          <ActionCard
            key={block.key}
            block={block}
            expanded={expanded}
            onToggleExpanded={toggle}
            onChange={(actions) =>
              replaceLines(
                block.startIndex,
                block.statementIndex,
                emitActionBlock(actions, block.comments),
              )
            }
            onMoveUp={swapWith(index, -1)}
            onMoveDown={swapWith(index, 1)}
            onDelete={() => removeBlock(block.startIndex, block.statementIndex)}
          />
        );
      case 'marker':
        return (
          <StatementRow
            key={block.key}
            kind="builder.marker"
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                <MarkerPreview
                  preText={t('builder.marker')}
                  label={block.label}
                  file={activeId}
                  blockKey={block.key}
                />
                <MarkerMark label={block.label} />
              </Box>
            }
            text={block.text}
            onCommit={(text) => commitStatement(block.statementIndex, text)}
            onMoveUp={swapWith(index, -1)}
            onMoveDown={swapWith(index, 1)}
            onDuplicate={() => duplicateStatement(block.statementIndex, block.text)}
            onDelete={() => removeBlock(block.startIndex, block.statementIndex)}
          />
        );
      case 'directive': {
        const exclusion = exclusionAt(block.statementIndex);

        if (block.form === null) {
          return (
            <StatementRow
              key={block.key}
              kind="builder.directive"
              title={
                exclusion === undefined
                  ? t('builder.directive')
                  : t(exclusionOpKey(exclusion.directive.op))
              }
              icon={exclusion === undefined ? undefined : exclusionIcon(exclusion.directive.op)}
              text={block.text}
              marks={exclusion === undefined ? undefined : <ExclusionMarks entry={exclusion} />}
              onCommit={(text) => commitStatement(block.statementIndex, text)}
              onMoveUp={swapWith(index, -1)}
              onMoveDown={swapWith(index, 1)}
              onDuplicate={() => duplicateStatement(block.statementIndex, block.text)}
              onDelete={() => removeBlock(block.startIndex, block.statementIndex)}
            />
          );
        }

        return (
          <DirectiveRow
            key={block.key}
            form={block.form}
            exclusion={exclusion}
            expanded={expanded}
            onToggleExpanded={toggle}
            onChange={(form) => commitStatement(block.statementIndex, emitDirective(form))}
            onMoveUp={swapWith(index, -1)}
            onMoveDown={swapWith(index, 1)}
            onDuplicate={() => duplicateStatement(block.statementIndex, block.text)}
            onDelete={() => removeBlock(block.startIndex, block.statementIndex)}
          />
        );
      }
    }
  };

  const revealAt = blocks.findIndex((block) => block.key === reveal?.blockKey);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!compiled.ok && (
        <Alert severity="error" sx={{ flexShrink: 0, mx: 1.5, mt: 1.5 }}>
          {t('debug.blocked')}
        </Alert>
      )}

      {blocks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {t('builder.empty')}
        </Typography>
      ) : (
        <BlockList
          count={blocks.length}
          isOpen={isOpen}
          render={renderBlock}
          dimmed={!compiled.ok}
          revealIndex={revealAt < 0 ? null : revealAt}
          revealSeq={reveal?.seq ?? 0}
        />
      )}
    </Box>
  );
}
