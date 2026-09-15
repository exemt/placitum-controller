import { useState } from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { RuleMatchesDialog } from '../RuleMatchesDialog';
import { RulePreview } from '../RulePreview';
import { useI18n } from '../../i18n/useI18n';
import type { ExclusionEntry } from '../../modsec/exclusions';

const SHOWN_RULES = 6;

interface ExclusionMarksProps {
  entry: ExclusionEntry;
  named?: boolean;
}

export function ExclusionMarks({ entry, named = false }: ExclusionMarksProps) {
  const { t } = useI18n();
  const { directive, matches } = entry;
  const [listOpen, setListOpen] = useState(false);

  const shown = matches.slice(0, SHOWN_RULES);
  const inactive = matches.length > 0 && matches.every((match) => !match.applies);
  const inactiveHint =
    directive.source === 'ctl' ? 'builder.exclusionLateHint' : 'builder.exclusionInactiveHint';

  return (
    <>
      {matches.length === 0 && (
        <Tooltip title={t('builder.exclusionNoMatchHint')}>
          <Chip
            size="small"
            variant="outlined"
            label={t('builder.exclusionNoMatch')}
            sx={{ flexShrink: 0 }}
          />
        </Tooltip>
      )}

      {matches.length > 0 && !named && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {t(matches.length === 1 ? 'builder.exclusionRule' : 'builder.exclusionRules')}
          </Typography>

          {shown.map((match) => (
            <RulePreview
              key={`${match.file}-${match.key}`}
              id={match.id}
              file={match.file}
              ruleKey={match.key}
            />
          ))}

          {matches.length > shown.length && (
            <Chip
              size="small"
              component="button"
              label={t('builder.rulePreviewViewAll', { count: String(matches.length) })}
              onClick={() => setListOpen(true)}
              sx={{ flexShrink: 0 }}
            />
          )}

          <RuleMatchesDialog
            open={listOpen}
            onClose={() => setListOpen(false)}
            ids={matches.map((match) => match.id)}
          />
        </>
      )}

      {inactive && (
        <Tooltip title={t(inactiveHint)}>
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={t('builder.exclusionInactive')}
            sx={{ flexShrink: 0 }}
          />
        </Tooltip>
      )}
    </>
  );
}
