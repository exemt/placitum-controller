import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { ChipInput } from './ChipInput';
import { ChoiceField } from './ChoiceField';
import { CommitField } from './CommitField';
import { Counter } from './Counter';
import { CtlExclusionList } from './CtlExclusionList';
import { LongTextField } from './LongTextField';
import { Section, SECTION_PADDING } from './Section';
import { SetvarSection } from './SetvarSection';
import { SideTitle } from './SideTitle';
import { SuggestField } from './SuggestField';
import { TagBrowseHost, TagMark } from './TagMark';
import { OtherActionsSection } from './extra/OtherActionsSection';
import { ruleActionCount, ruleActionSummary } from './summary';
import { FLAG_COLUMN, PHASE_COLUMN, REACTION_COLUMN, STATUS_COLUMN } from './layout';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { isExclusionCtl } from '../../modsec/exclusions';
import { AUDIT_FLAGS, LOG_FLAGS, takesDestination } from '../../modsec/semantics';
import {
  disruptiveChoices,
  logFlagChoices,
  phaseChoices,
  severityChoices,
} from '../../modsec/choices';
import { MACRO_SUGGESTIONS, STATUS_SUGGESTIONS, tagSuggestions } from '../../modsec/suggestions';
import type { DisruptiveAction } from '../../modsec/semantics';
import type { ExclusionEntry } from '../../modsec/exclusions';
import type { VisualActions } from '../../modsec/model';

interface ActionsPanelProps {
  actions: VisualActions;
  onChange: (next: VisualActions) => void;
  alwaysExpanded?: boolean;
  hideId?: boolean;
  exclusions?: ExclusionEntry[];
}

function flagName(flag: boolean | null, [on, off]: readonly [string, string]): string {
  if (flag === null) return '';
  return flag ? on : off;
}

function parseFlag(name: string, [on]: readonly [string, string]): boolean | null {
  if (name === '') return null;
  return name === on;
}

export function ActionsPanel({
  actions,
  onChange,
  alwaysExpanded,
  hideId,
  exclusions = [],
}: ActionsPanelProps) {
  const { t } = useI18n();
  const { tags } = useWorkspace();

  const statusRelevant =
    actions.disruptive === 'deny' || actions.disruptive === 'redirect';

  const log = flagName(actions.log, LOG_FLAGS);
  const auditlog = flagName(actions.auditlog, AUDIT_FLAGS);

  const settings = actions.extra.filter((item) => !isExclusionCtl(item));
  const hasCtl = exclusions.length > 0 && actions.extra.some(isExclusionCtl);

  const body = (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {!hideId && (
          <CommitField
            size="small"
            label={t('builder.id')}
            value={actions.id}
            onCommit={(id) => onChange({ ...actions, id })}
            sx={{ width: 110 }}
          />
        )}

        <Box sx={{ width: PHASE_COLUMN }}>
          <ChoiceField
            prefix="phase:"
            label={t('builder.phase')}
            emptyLabel={t('builder.unset')}
            choices={phaseChoices(actions.phase)}
            value={actions.phase}
            onChange={(phase) => onChange({ ...actions, phase })}
          />
        </Box>

        <Box sx={{ width: REACTION_COLUMN }}>
          <ChoiceField
            label={t('builder.disruptive')}
            emptyLabel={t('builder.unset')}
            choices={disruptiveChoices(actions.disruptive)}
            value={actions.disruptive}
            onChange={(name) => {
              const disruptive = name as DisruptiveAction | '';
              onChange({
                ...actions,
                disruptive,
                disruptiveValue: takesDestination(disruptive) ? actions.disruptiveValue : '',
              });
            }}
          />
        </Box>

        {takesDestination(actions.disruptive) && (
          <CommitField
            size="small"
            label={t('builder.destination')}
            placeholder={actions.disruptive === 'proxy' ? 'http://backend/' : '/blocked.html'}
            value={actions.disruptiveValue}
            onCommit={(disruptiveValue) => onChange({ ...actions, disruptiveValue })}
            error={actions.disruptiveValue === ''}
            sx={{ flex: '1 1 220px' }}
          />
        )}

        <SuggestField
          label={t('builder.status')}
          disabled={!statusRelevant}
          suggestions={STATUS_SUGGESTIONS}
          value={actions.status}
          onCommit={(status) => onChange({ ...actions, status })}
          sx={{ width: STATUS_COLUMN }}
        />

        <CommitField
          size="small"
          label={t('builder.message')}
          value={actions.msg}
          onCommit={(msg) => onChange({ ...actions, msg })}
          sx={{ flex: '1 1 260px' }}
        />
      </Stack>

      {hasCtl && (
        <Stack spacing={0.75}>
          <SideTitle label={t('builder.setsExclusions')} />
          <CtlExclusionList
            actions={actions.extra}
            entries={exclusions}
            onChange={(extra) => onChange({ ...actions, extra })}
            link={0}
            links={1}
          />
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ width: 200 }}>
          <ChoiceField
            prefix="severity:"
            label={t('builder.severity')}
            emptyLabel={t('builder.unset')}
            choices={severityChoices(actions.severity)}
            value={actions.severity}
            onChange={(severity) => onChange({ ...actions, severity })}
          />
        </Box>

        <Box sx={{ width: FLAG_COLUMN }}>
          <ChoiceField
            label={t('builder.log')}
            emptyLabel={t('builder.unset')}
            choices={logFlagChoices(LOG_FLAGS, log)}
            value={log}
            onChange={(name) => onChange({ ...actions, log: parseFlag(name, LOG_FLAGS) })}
          />
        </Box>

        <Box sx={{ width: FLAG_COLUMN }}>
          <ChoiceField
            label={t('builder.auditlog')}
            emptyLabel={t('builder.unset')}
            choices={logFlagChoices(AUDIT_FLAGS, auditlog)}
            value={auditlog}
            onChange={(name) =>
              onChange({ ...actions, auditlog: parseFlag(name, AUDIT_FLAGS) })
            }
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={actions.capture}
              onChange={(event) =>
                onChange({ ...actions, capture: event.target.checked })
              }
            />
          }
          label={<Typography variant="body2">{t('builder.capture')}</Typography>}
        />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <CommitField
          size="small"
          label={t('builder.ver')}
          placeholder="OWASP_CRS/4.0.0"
          value={actions.ver}
          onCommit={(ver) => onChange({ ...actions, ver })}
          sx={{ flex: '1 1 220px' }}
        />
        <CommitField
          size="small"
          label={t('builder.rev')}
          value={actions.rev}
          onCommit={(rev) => onChange({ ...actions, rev })}
          sx={{ width: 110 }}
        />
        <CommitField
          size="small"
          label={t('builder.maturity')}
          placeholder="1–9"
          value={actions.maturity}
          onCommit={(maturity) => onChange({ ...actions, maturity })}
          sx={{ width: 120 }}
        />
        <CommitField
          size="small"
          label={t('builder.accuracy')}
          placeholder="1–9"
          value={actions.accuracy}
          onCommit={(accuracy) => onChange({ ...actions, accuracy })}
          sx={{ width: 120 }}
        />
      </Stack>

      <LongTextField
        fullWidth
        label={t('builder.logdata')}
        dialogTitle={t('builder.logdata')}
        suggestions={MACRO_SUGGESTIONS}
        value={actions.logdata}
        onCommit={(logdata) => onChange({ ...actions, logdata })}
      />

      <TagBrowseHost>
        <ChipInput
          fullWidth
          label={t('builder.tags')}
          placeholder={t('builder.addTag')}
          dialogTitle={t('builder.tags')}
          separators={[',']}
          suggestions={tagSuggestions(tags).filter(
            (item) => !actions.tags.includes(item.value),
          )}
          values={actions.tags}
          onChange={(next) => onChange({ ...actions, tags: next })}
          optionEnd={(option) => (
            <TagMark tag={option.value} count={option.badge} />
          )}
          wrapChip={(tag, chip) => <TagMark tag={tag}>{chip}</TagMark>}
        />
      </TagBrowseHost>

      <SetvarSection
        values={actions.setvar}
        onChange={(setvar) => onChange({ ...actions, setvar })}
      />

      <OtherActionsSection items={settings} />
    </Stack>
  );

  if (alwaysExpanded) return <Box sx={{ p: SECTION_PADDING }}>{body}</Box>;

  return (
    <Section
      title={t('builder.actions')}
      summary={ruleActionSummary(actions)}
      monospace
      counters={
        <Counter
          hint={t('builder.countActions', { count: String(ruleActionCount(actions)) })}
          count={ruleActionCount(actions)}
        />
      }
    >
      {body}
    </Section>
  );
}
