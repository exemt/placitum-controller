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

const PICK_LABEL: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.exclusionPickId',
  msg: 'builder.exclusionPickMsg',
  tag: 'builder.exclusionPickTag',
};

const WHO: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.exclusionWhoId',
  msg: 'builder.exclusionWhoMsg',
  tag: 'builder.exclusionWhoTag',
};

const ID_OR_RANGE = /^\d+(-\d+)?$/;

interface ExclusionDirectivePanelProps {
  form: Extract<DirectiveForm, { arg: 'exclusion' }>;
  onChange: (next: DirectiveForm) => void;
}

export function ExclusionDirectivePanel({ form, onChange }: ExclusionDirectivePanelProps) {
  const { t } = useI18n();
  const { tags } = useWorkspace();
  const kind = exclusionDirectiveKind(form.name);
  if (kind === null) return null;

  const { op, selector } = kind;

  const targets = op === 'updateTarget' ? readExclusionTargets(form.payload) : [];
  const dropped = targets.filter((target) => target.remove);
  const added = targets.filter((target) => !target.remove);

  const rows = targets.length === 0 ? [makeExclusionTarget('')] : targets;
  const setTargets = (next: ExclusionTarget[]) =>
    onChange({ ...form, payload: writeExclusionTargets(next) });

  const canReplace = added.length > 0;

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">
        {phrase(t, form, kind, dropped, added)}
      </Typography>

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

        {op === 'updateTarget' && (
          <Stack spacing={0.5}>
            <Tooltip title={t('builder.exclusionReplacedHint')} placement="top-start">
              <Box sx={{ width: PICK_COLUMN }}>
                <SuggestField
                  monospace
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

  return t('builder.exclusionSaysTarget', { who, what: clauses.join('; ') });
}
