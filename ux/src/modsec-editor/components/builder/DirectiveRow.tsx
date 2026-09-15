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

const ISSUE_LABEL: Record<DirectiveIssue['code'], TranslationKey> = {
  directiveValueMissing: 'builder.directiveValueMissing',
  directiveBadValue: 'builder.directiveBadValue',
  directiveNotNumber: 'builder.directiveNotNumber',
  directiveUnknownFlag: 'builder.directiveUnknownFlag',
};

interface DirectiveRowProps {
  form: DirectiveForm;
  exclusion?: ExclusionEntry;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (next: DirectiveForm) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
}

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
    case 'flags':
    case 'list':
    case 'actions':
    case 'exclusion':
      return null;

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

function ValueColumn({ children }: { children: ReactNode }) {
  return <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>;
}
