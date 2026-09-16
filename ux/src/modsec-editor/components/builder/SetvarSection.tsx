import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { ChoiceField } from './ChoiceField';
import { LongTextField } from './LongTextField';
import { SideTitle } from './SideTitle';
import { SuggestField } from './SuggestField';
import { VariableBrowseHost, VariableMark } from './VariableMark';
import { COLLECTION_COLUMN, ICON_COLUMN, SETVAR_OP_COLUMN } from './layout';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { setvarCollectionChoices, setvarOpChoices } from '../../modsec/choices';
import { collectionVariables } from '../../modsec/variables';
import {
  freeVarName,
  makeSetvar,
  readSetvar,
  readSetvarTarget,
  writeSetvar,
} from '../../modsec/setvar';
import { MACRO_SUGGESTIONS, SETVAR_SUGGESTIONS, setvarNameSuggestions } from '../../modsec/suggestions';
import type { SetvarOp } from '../../modsec/setvar';

const ROW_COLUMNS = [
  `${COLLECTION_COLUMN}px`,
  'minmax(160px, 1.5fr)',
  `${SETVAR_OP_COLUMN}px`,
  'minmax(120px, 1fr)',
  `${ICON_COLUMN}px`,
].join(' ');

interface SetvarSectionProps {
  values: string[];
  onChange: (next: string[]) => void;
}

export function SetvarSection({ values, onChange }: SetvarSectionProps) {
  const { t } = useI18n();
  const { variables } = useWorkspace();

  const replace = (index: number, raw: string) =>
    onChange(values.map((value, i) => (i === index ? raw : value)));

  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));

  const add = () => {
    const taken = [
      ...collectionVariables(variables, 'tx'),
      ...values.map((value) => readSetvarTarget(value)).map((target) => target?.name ?? ''),
    ];
    onChange([...values, makeSetvar(freeVarName(taken))]);
  };

  return (
    <VariableBrowseHost>
      <Stack spacing={0.75}>
      <SideTitle label={t('builder.setvar')} />

      {values.map((raw, index) => {
        const assignment = readSetvar(raw);

        if (assignment === null) {
          const target = readSetvarTarget(raw);
          return (
            <Box
              key={index}
              sx={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 1 }}
            >
              <Tooltip title={t('builder.setvarRaw')} placement="top-start" enterDelay={600}>
                <Box sx={{ gridColumn: 'span 4', minWidth: 0 }}>
                  <LongTextField
                    fullWidth
                    monospace
                    dialogTitle={t('builder.setvar')}
                    suggestions={SETVAR_SUGGESTIONS}
                    value={raw}
                    onCommit={(value) => replace(index, value)}
                    actions={
                      target === null ? undefined : (
                        <VariableMark collection={target.collection} name={target.name} />
                      )
                    }
                  />
                </Box>
              </Tooltip>

              <RemoveButton onRemove={() => remove(index)} />
            </Box>
          );
        }

        const { collection, name, op, value } = assignment;
        const commit = (next: Partial<typeof assignment>) =>
          replace(index, writeSetvar({ ...assignment, ...next }));

        return (
          <Box key={index} sx={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 1 }}>
            <ChoiceField
              label={t('builder.setvarCollection')}
              choices={setvarCollectionChoices(collection)}
              value={collection}
              onChange={(next) => commit({ collection: next })}
            />

            <SuggestField
              label={t('builder.setvarName')}
              monospace
              required
              suggestions={setvarNameSuggestions(collection, variables)}
              value={name}
              error={name === '' ? t('builder.setvarNameRequired') : undefined}
              onCommit={(next) => commit({ name: next })}
              optionEnd={(option) => (
                <VariableMark
                  collection={collection}
                  name={option.value}
                  count={option.badge}
                />
              )}
              endAdornment={
                <InputAdornment position="end">
                  <VariableMark collection={collection} name={name} />
                </InputAdornment>
              }
            />

            <ChoiceField
              label={t('builder.setvarOp')}
              choices={setvarOpChoices(op)}
              value={op}
              onChange={(next) =>
                commit({
                  op: next as SetvarOp,
                  value: next === 'delete' ? '' : value,
                })
              }
            />

            <Tooltip
              title={op === 'delete' ? t('builder.setvarNoValue') : ''}
              placement="top-start"
            >
              <Box sx={{ minWidth: 0 }}>
                <LongTextField
                  fullWidth
                  monospace
                  label={t('builder.setvarValue')}
                  dialogTitle={t('builder.setvarValue')}
                  disabled={op === 'delete'}
                  suggestions={MACRO_SUGGESTIONS}
                  value={value}
                  onCommit={(next) => commit({ value: next })}
                />
              </Box>
            </Tooltip>

            <RemoveButton onRemove={() => remove(index)} />
          </Box>
        );
      })}

      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={add}>
          {t('builder.addSetvar')}
        </Button>
      </Box>
      </Stack>
    </VariableBrowseHost>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <Tooltip title={t('builder.deleteSetvar')}>
      <IconButton size="small" aria-label={t('builder.deleteSetvar')} onClick={onRemove}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
