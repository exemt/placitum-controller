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

  const rows: ExclusionRef[] = [
    ...(effect?.removedBy ?? []),
    ...(effect?.targetEdits ?? []),
    ...(effect?.actionEdits ?? []),
  ];

  const ctls = [rule.actions.extra, ...rule.conditions.slice(1).map((c) => c.extra)]
    .flat()
    .filter(isExclusionCtl);
  const entriesAt = (statementIndex: number) =>
    own.filter((entry) => entry.directive.place.index === statementIndex);

  const addCtl = ({ op, selector }: CtlExclusionKind) => {
    const added = ctlExclusionActions({
      op,
      selector,
      pick: '',
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

  const id = rule.actions.id;
  const numbered = /^\d+$/.test(id);
  const alreadyOff = (effect?.removedBy ?? []).find((ref) => ref.source === 'directive');

  const append = (line: string) => insertLines(rule.tailIndex, [line]);

  const total = rows.length + ctls.length;

  const twoSided = rows.length > 0;

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
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <Chip
                component="button"
                size="small"
                color="warning"
                variant="outlined"
                label={t('builder.excludeRule')}
                disabled={!numbered || alreadyOff !== undefined}
                onClick={() => append(excludeRuleLine(id))}
              />
            </Box>
          </Tooltip>

          <Tooltip
            title={numbered ? t('builder.excludeTargetHint', { id }) : t('builder.excludeNeedsId')}
          >
            <Box component="span" sx={{ display: 'inline-flex' }}>
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

                <Box sx={{ flex: 1 }} />
                <Tooltip title={t('builder.exclusionRevealLine', { line: String(ref.line) })}>
                  <Link
                    component="button"
                    variant="caption"
                    underline="hover"
                    onClick={() => revealLine(ref.line, ref.file)}
                    sx={{ flexShrink: 0 }}
                  >
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

        <Stack spacing={1.5}>
          {twoSided && (
            <SideTitle
              label={t('builder.exclusionsOutbound')}
              hint={t('builder.exclusionsOutboundHint')}
            />
          )}

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
