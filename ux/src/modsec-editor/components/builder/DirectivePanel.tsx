import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChipInput } from './ChipInput';
import { DefaultActionPanel } from './DefaultActionPanel';
import { ExclusionDirectivePanel } from './ExclusionDirectivePanel';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { AUDIT_LOG_PARTS, directiveMeta } from '../../modsec/directives';
import type { DirectiveForm } from '../../modsec/directives';

const PART_COLUMN = 200;

interface DirectivePanelProps {
  form: DirectiveForm;
  onChange: (next: DirectiveForm) => void;
}

export function DirectivePanel({ form, onChange }: DirectivePanelProps) {
  switch (form.arg) {
    case 'flags':
      return <FlagsPanel form={form} onChange={onChange} />;
    case 'list':
      return <ListPanel form={form} onChange={onChange} />;
    case 'actions':
      return <DefaultActionPanel form={form} onChange={onChange} />;
    case 'exclusion':
      return <ExclusionDirectivePanel form={form} onChange={onChange} />;
    default:
      return null;
  }
}

function FlagsPanel({
  form,
  onChange,
}: {
  form: Extract<DirectiveForm, { arg: 'flags' }>;
  onChange: (next: DirectiveForm) => void;
}) {
  const { t } = useI18n();
  const localize = useLabel();

  const suggestions = Object.entries(AUDIT_LOG_PARTS).map(([value, part]) => ({
    value,
    hint: part.note,
  }));

  return (
    <Stack spacing={1}>
      <ChipInput
        monospace
        values={form.parts}
        onChange={(parts) => onChange({ ...form, parts })}
        label={t('builder.directiveParts')}
        dialogTitle={t('builder.directiveParts')}
        suggestions={suggestions}
        isValueValid={(value) => AUDIT_LOG_PARTS[value] !== undefined}
        invalidHint={t('builder.directiveUnknownFlagHint')}
        error={form.parts.length === 0}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${PART_COLUMN}px, 1fr))`,
          columnGap: 2,
          rowGap: 0.25,
        }}
      >
        {form.parts.map((part, index) => (
          <Typography key={`${part}-${index}`} variant="caption" color="text.secondary" noWrap>
            {localize(AUDIT_LOG_PARTS[part]?.label, part)}
          </Typography>
        ))}
      </Box>
    </Stack>
  );
}

function ListPanel({
  form,
  onChange,
}: {
  form: Extract<DirectiveForm, { arg: 'list' }>;
  onChange: (next: DirectiveForm) => void;
}) {
  const { t } = useI18n();
  const meta = directiveMeta(form.name);
  const localize = useLabel();

  return (
    <ChipInput
      monospace
      values={form.items}
      onChange={(items) => onChange({ ...form, items })}
      label={localize(meta?.label, t('builder.directiveValue'))}
      dialogTitle={localize(meta?.label, t('builder.directiveValue'))}
      suggestions={meta?.hints ?? []}
      separators={[' ', ',']}
      error={form.items.length === 0}
    />
  );
}
