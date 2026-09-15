import { useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CHEVRON_COLUMN, TITLE_COLUMN } from './layout';
import { useI18n } from '../../i18n/useI18n';
import { BLOCK_ROW } from '../../theme';

export const SECTION_PADDING = 1.5;

interface SectionProps {
  title: string;
  summary?: string;
  monospace?: boolean;
  counters?: ReactNode;
  actions?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function Section({
  title,
  summary,
  monospace,
  counters,
  actions,
  defaultExpanded = false,
  children,
}: SectionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', height: BLOCK_ROW }}>
        <ButtonBase
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'builder.collapseSection' : 'builder.expandSection', {
            name: title,
          })}
          sx={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            pl: SECTION_PADDING,
            pr: actions === undefined && counters === undefined ? SECTION_PADDING : 1,
            gap: 1,
            textAlign: 'left',
            borderRadius: 0,
          }}
        >
          <Box
            sx={{
              width: CHEVRON_COLUMN,
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </Box>

          <Typography variant="subtitle2" noWrap sx={{ width: TITLE_COLUMN, flexShrink: 0 }}>
            {title}
          </Typography>

          {expanded || summary === undefined ? (
            <Box sx={{ flex: 1 }} />
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{
                flex: 1,
                minWidth: 0,
                fontFamily: monospace ? 'ui-monospace, Consolas, monospace' : undefined,
              }}
            >
              {summary}
            </Typography>
          )}

        </ButtonBase>

        {(actions !== undefined || counters !== undefined) && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexShrink: 0, pr: SECTION_PADDING }}
          >
            {actions !== undefined && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                {actions}
              </Stack>
            )}

            {counters !== undefined && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                {counters}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>

      <Collapse in={expanded} unmountOnExit>
        <Box
          sx={{
            p: SECTION_PADDING,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
