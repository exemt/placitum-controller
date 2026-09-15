import { Children } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { lighten } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { FIELD_GUTTER, LIST_PADDING } from '../../theme';

export type SectionTone = 'fit' | 'plain' | 'unfit';

const TONE_COLOR: Record<SectionTone, string> = {
  fit: 'success.main',
  plain: 'text.secondary',
  unfit: 'warning.main',
};

interface ListSectionProps {
  title: string;
  tone?: SectionTone;
  children: ReactNode;
}

export function ListSection({ title, tone = 'plain', children }: ListSectionProps) {
  const color = TONE_COLOR[tone];

  return (
    <Box
      component="li"
      sx={{
        '&:first-of-type > .ListSection-head': { borderTopColor: 'transparent' },
      }}
    >
      <Box
        className="ListSection-head"
        sx={{
          position: 'sticky',
          top: -LIST_PADDING,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: `${FIELD_GUTTER}px`,
          py: 0.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) => lighten(theme.palette.background.paper, 0.05),
        }}
      >
        <Box sx={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', bgcolor: color }} />

        <Typography
          variant="caption"
          noWrap
          sx={{
            color,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Typography>

        <Box sx={{ flex: 1, minWidth: 8, height: '1px', bgcolor: 'divider' }} />

        <Typography variant="caption" sx={{ flexShrink: 0, fontSize: 10.5, color: 'text.disabled' }}>
          {Children.count(children)}
        </Typography>
      </Box>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {children}
      </Box>
    </Box>
  );
}
