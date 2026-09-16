import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CHEVRON_COLUMN, TITLE_COLUMN } from './layout';
import { useI18n } from '../../i18n/useI18n';
import { BLOCK_ROW } from '../../theme';
import type { ReactNode } from 'react';
import type { TranslationKey } from '../../i18n/translations';

const MONO = 'ui-monospace, Consolas, monospace';

interface BlockToggle {
  expanded: boolean;
  onToggle: () => void;
  collapseLabel: TranslationKey;
  expandLabel: TranslationKey;
}

interface BlockHeaderProps {
  toggle: BlockToggle | null;
  title: ReactNode;
  children: ReactNode;
  marks?: ReactNode;
  actions: ReactNode;
}

export function BlockHeader({ toggle, title, children, marks, actions }: BlockHeaderProps) {
  const { t } = useI18n();
  const label =
    toggle === null ? '' : t(toggle.expanded ? toggle.collapseLabel : toggle.expandLabel);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        height: BLOCK_ROW,
        px: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      {toggle === null ? (
        <Box sx={{ width: CHEVRON_COLUMN, flexShrink: 0 }} />
      ) : (
        <Tooltip title={label}>
          <IconButton
            size="small"
            onClick={toggle.onToggle}
            aria-label={label}
            aria-expanded={toggle.expanded}
          >
            {toggle.expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      )}

      <Box
        sx={{
          width: TITLE_COLUMN,
          flexShrink: 0,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {title}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>

      {marks}
      {actions}
    </Stack>
  );
}

export function BlockTitle({
  monospace = false,
  hint,
  children,
}: {
  monospace?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const text = (
    <Typography
      variant="body2"
      noWrap
      sx={{
        minWidth: 0,
        fontWeight: 500,
        fontFamily: monospace ? MONO : undefined,
      }}
    >
      {children}
    </Typography>
  );

  if (hint === undefined || hint === '') return text;

  return (
    <Tooltip describeChild title={hint} placement="top-start" enterDelay={600}>
      {text}
    </Tooltip>
  );
}
