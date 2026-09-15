import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { CTL_EXCLUSION_KINDS } from '../../modsec/exclusions';
import { ctlExclusionMeta } from '../../modsec/semantics';
import { FIELD_GUTTER } from '../../theme';
import type { CtlExclusionKind } from '../../modsec/exclusions';

const MONO = 'ui-monospace, Consolas, monospace';

export function AddCtlExclusionMenu({ onAdd }: { onAdd: (kind: CtlExclusionKind) => void }) {
  const { t } = useI18n();
  const localize = useLabel();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  let group = '';
  const items = CTL_EXCLUSION_KINDS.flatMap((kind) => {
    const meta = ctlExclusionMeta(kind.option);
    const head = localize(meta?.group, '');
    const opened = head !== group;
    group = head;

    return [
      ...(opened
        ? [
            <ListSubheader
              key={head}
              sx={{
                px: `${FIELD_GUTTER}px`,
                py: 0.5,
                lineHeight: 1.6,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                bgcolor: 'background.paper',
              }}
            >
              {head}
            </ListSubheader>,
          ]
        : []),

      <MenuItem
        key={kind.option}
        onClick={() => {
          setAnchor(null);
          onAdd(kind);
        }}
        sx={{ px: `${FIELD_GUTTER}px`, whiteSpace: 'normal' }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%', py: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
              {localize(meta?.label, kind.option)}
            </Typography>

            <Box sx={{ flex: 1, minWidth: 8 }} />

            <Typography
              variant="caption"
              sx={{
                flexShrink: 0,
                fontFamily: MONO,
                px: 0.5,
                borderRadius: 0.5,
                bgcolor: 'action.hover',
                color: 'text.secondary',
              }}
            >
              {kind.option}
            </Typography>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ whiteSpace: 'normal', lineHeight: 1.35 }}
          >
            {localize(meta?.note, '')}
          </Typography>
        </Stack>
      </MenuItem>,
    ];
  });

  return (
    <>
      <Tooltip title={anchor === null ? t('builder.addCtlExclusionHint') : ''}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            endIcon={<ArrowDropDownIcon />}
            aria-haspopup="menu"
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            {t('builder.addCtlExclusion')}
          </Button>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 'min(460px, 92vw)' } } }}
      >
        {items}
      </Menu>
    </>
  );
}
