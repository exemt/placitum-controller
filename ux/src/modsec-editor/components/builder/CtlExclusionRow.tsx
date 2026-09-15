import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { Bracket, BracketLine } from './Bracket';
import { ChoiceField } from './ChoiceField';
import { ExclusionMarks } from './ExclusionMarks';
import { SuggestField } from './SuggestField';
import { TagBrowseHost, TagMark } from './TagMark';
import { TargetRow } from './TargetRow';
import { CONDITION_PADDING, CONDITION_PADDING_TOP, PICK_COLUMN } from './layout';
import { useBuilderView } from '../../context/builderViewContext';
import { useForeignFile } from '../../context/useForeignFile';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { ctlExclusionChoices } from '../../modsec/choices';
import { ctlOption } from '../../modsec/exclusions';
import { makeTarget, targetsToVariables } from '../../modsec/model';
import { serializeVariable } from '../../modsec/serialize';
import { tagSuggestions } from '../../modsec/suggestions';
import type { I18nContextValue } from '../../i18n/context';
import type { TranslationKey } from '../../i18n/translations';
import type {
  CtlExclusion,
  ExclusionEntry,
  ExclusionMatch,
  ExclusionSelector,
} from '../../modsec/exclusions';
import type { VisualTarget } from '../../modsec/model';

interface CtlExclusionRowProps {
  value: CtlExclusion;
  entry?: ExclusionEntry;
  link: number;
  links: number;
  onChange: (next: CtlExclusion) => void;
  onRemove: () => void;
}

const PHRASE: Record<string, TranslationKey> = {
  'remove/id': 'builder.ctlRemoveById',
  'remove/msg': 'builder.ctlRemoveByMsg',
  'remove/tag': 'builder.ctlRemoveByTag',
  'removeTarget/id': 'builder.ctlRemoveTargetById',
  'removeTarget/msg': 'builder.ctlRemoveTargetByMsg',
  'removeTarget/tag': 'builder.ctlRemoveTargetByTag',
};

const PICK_LABEL: Record<ExclusionSelector, TranslationKey> = {
  id: 'builder.ctlPickId',
  msg: 'builder.ctlPickMsg',
  tag: 'builder.ctlPickTag',
};

const SLOT = '\u0000';

export function CtlExclusionRow({
  value,
  entry,
  link,
  links,
  onChange,
  onRemove,
}: CtlExclusionRowProps) {
  const { t } = useI18n();
  const { tags } = useWorkspace();

  const terms = targetsToVariables(value.targets).filter((term) => term.name !== '');
  const shown = terms.map(serializeVariable).join(', ');

  const found = entry?.matches ?? [];
  const named =
    value.selector === 'id' && found.length === 1 && found[0].id === value.pick
      ? found[0]
      : undefined;

  const phrase =
    value.pick === ''
      ? t('builder.ctlIncomplete')
      : value.op === 'removeTarget' && terms.length === 0
        ? t('builder.ctlIncompleteTarget')
        : chained(
            t,
            t(PHRASE[`${value.op}/${value.selector}`], {
              pick: named === undefined ? value.pick : SLOT,
              target: shown,
            }),
            link,
            links,
          );

  const targets = value.targets.length === 0 ? [makeTarget('')] : value.targets;
  const setTargets = (next: VisualTarget[]) => onChange({ ...value, targets: next });

  return (
    <Stack
      spacing={0.75}
      sx={{
        p: CONDITION_PADDING,
        pt: CONDITION_PADDING_TOP,
        borderRadius: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ position: 'relative', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}
      >
        <BracketLine name="ctl" height="100%" />

        <Phrase text={phrase} match={named} />

        {entry !== undefined && <ExclusionMarks entry={entry} named={named !== undefined} />}

        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('builder.deleteExclusion')}>
          <IconButton size="small" onClick={onRemove} aria-label={t('builder.deleteExclusion')}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ width: 250 }}>
          <ChoiceField
            label={t('builder.ctlOption')}
            emptyLabel={t('builder.unset')}
            choices={ctlExclusionChoices(ctlOption(value.op, value.selector))}
            value={ctlOption(value.op, value.selector)}
            onChange={(option) => {
              const selector: ExclusionSelector = option.endsWith('ByTag')
                ? 'tag'
                : option.endsWith('ByMsg')
                  ? 'msg'
                  : 'id';
              const op = option.includes('Target') ? 'removeTarget' : 'remove';
              onChange({ ...value, op, selector, targets: op === 'remove' ? [] : value.targets });
            }}
          />
        </Box>

        {value.selector === 'tag' ? (
          <TagBrowseHost>
            <SuggestField
              label={t(PICK_LABEL.tag)}
              suggestions={tagSuggestions(tags)}
              value={value.pick}
              onCommit={(pick) => onChange({ ...value, pick })}
              error={value.pick === '' ? t('builder.ctlPickRequired') : undefined}
              optionEnd={(option) => (
                <TagMark tag={option.value} count={option.badge} />
              )}
              sx={{ width: PICK_COLUMN }}
            />
          </TagBrowseHost>
        ) : (
          <SuggestField
            label={t(PICK_LABEL[value.selector])}
            suggestions={[]}
            value={value.pick}
            onCommit={(pick) => onChange({ ...value, pick })}
            error={value.pick === '' ? t('builder.ctlPickRequired') : undefined}
            sx={{ width: PICK_COLUMN }}
          />
        )}
      </Stack>

      {value.op === 'removeTarget' && (
        <Box sx={{ pt: 1 }}>
          <Bracket label={t('builder.and')} color="error.main" line="target">
            <Stack spacing={2}>
              {targets.map((target, index) => (
                <TargetRow
                  key={`${target.name}-${index}`}
                  target={target}
                  canRemove={targets.length > 1}
                  error={target.name === '' ? t('builder.ctlTargetRequired') : undefined}
                  countBlocked={t('builder.ctlTargetNoCount')}
                  exceptBlocked={t('builder.ctlTargetNoExcept')}
                  onChange={(next) => setTargets(targets.map((v, i) => (i === index ? next : v)))}
                  onRemove={() => setTargets(targets.filter((_, i) => i !== index))}
                />
              ))}

              <Box sx={{ position: 'relative', display: 'flex' }}>
                <BracketLine name="target" height="100%" />
                <Tooltip title={t('builder.addCtlTargetHint')}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<AddIcon />}
                      onClick={() => setTargets([...targets, makeTarget()])}
                    >
                      {t('builder.addCtlTarget')}
                    </Button>
                  </Box>
                </Tooltip>
              </Box>
            </Stack>
          </Bracket>
        </Box>
      )}
    </Stack>
  );
}

function chained(
  t: I18nContextValue['t'],
  phrase: string,
  link: number,
  links: number,
): string {
  if (links < 2) return phrase;
  const key = link === links - 1 ? 'builder.ctlPhraseWholeChain' : 'builder.ctlPhraseLink';
  return t(key, { phrase, n: String(link + 1) });
}

function Phrase({ text, match }: { text: string; match?: ExclusionMatch }) {
  const { t } = useI18n();
  const { revealRule } = useBuilderView();
  const foreign = useForeignFile(match?.file);

  if (match === undefined) return <Typography variant="body2">{text}</Typography>;

  const [before, ...after] = text.split(SLOT);

  return (
    <Typography variant="body2">
      {before}
      <Tooltip
        title={
          foreign === ''
            ? t('builder.exclusionReveal', { id: match.id })
            : t('builder.exclusionRevealIn', { id: match.id, file: foreign })
        }
      >
        <Link
          component="button"
          variant="body2"
          underline="hover"
          onClick={() => revealRule(match.key, match.file)}
          sx={{ verticalAlign: 'baseline' }}
        >
          {match.id}
        </Link>
      </Tooltip>
      {after.join(SLOT)}
    </Typography>
  );
}
