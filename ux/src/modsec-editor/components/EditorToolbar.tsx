import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { AddDirectiveDialog } from './builder/AddDirectiveDialog';
import { useRule } from '../context/ruleContext';
import { useBuilderView } from '../context/builderViewContext';
import { useI18n } from '../i18n/useI18n';
import { ICON_BUTTON_PAD } from '../theme';
import type { EditorTab } from '../context/editorViewContext';

const GROUP_GAP = 8;

function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'baseline',
        gap: `${GROUP_GAP - ICON_BUTTON_PAD}px`,
        pl: `${GROUP_GAP}px`,
        pr: `${GROUP_GAP - ICON_BUTTON_PAD}px`,
        borderRadius: 1,
        bgcolor: 'background.default',
        height: 26
      }}
      spacing={0.5}
    >
      {children}
    </Stack>
  );
}

export function HistoryButtons() {
  const { t } = useI18n();
  const { undo, redo, canUndo, canRedo } = useRule();

  return (
    <Stack direction="row" spacing={0.5} sx={{mr:2}}>
      <Tooltip title={t('toolbar.undo')}>
        <span>
          <IconButton
            size="small"
            disabled={!canUndo}
            onClick={undo}
            aria-label={t('toolbar.undo')}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('toolbar.redo')}>
        <span style={{ height: 20, width: 20 }}>
          <IconButton
            size="small"
            disabled={!canRedo}
            onClick={redo}
            aria-label={t('toolbar.redo')}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

function ExpansionControls() {
  const { t } = useI18n();
  const { expandAll, collapseAll, expandedCount, collapsibleCount } = useBuilderView();

  if (collapsibleCount === 0) return null;

  return (
    <ControlGroup>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ lineHeight: '20px' }}>
        {t('builder.expandedOf', {
          expanded: String(expandedCount),
          total: String(collapsibleCount),
        })}
      </Typography>
      <Stack direction="row" sx={{ gap: `${GROUP_GAP - 2 * ICON_BUTTON_PAD}px` }}>
        <Tooltip title={t('builder.collapseAll')}>
          <span style={{ height: 20, width: 20 }}>
            <IconButton
              size="small"
              disabled={expandedCount === 0}
              onClick={collapseAll}
              aria-label={t('builder.collapseAll')}
              sx={{ height: 20, width: 20 }}
            >
              <UnfoldLessIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip
          title={t(collapsibleCount > 100 ? 'builder.expandAllSlow' : 'builder.expandAll')}
        >
          <span style={{ height: 20, width: 20 }}>
            <IconButton
              size="small"
              disabled={expandedCount === collapsibleCount}
              onClick={expandAll}
              aria-label={t('builder.expandAll')}
              sx={{ height: 20, width: 20 }}
            >
              <UnfoldMoreIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </ControlGroup>
  );
}

function FormatButton() {
  const { t } = useI18n();
  const { formatSource, canFormat } = useRule();

  return (
    <Tooltip title={t(canFormat ? 'toolbar.formatHint' : 'toolbar.formatDone')}>
      <span>
        <Button
          size="small"
          variant="contained"
          disabled={!canFormat}
          onClick={formatSource}
          startIcon={<AutoFixHighIcon fontSize="small" />}
        >
          {t('toolbar.format')}
        </Button>
      </span>
    </Tooltip>
  );
}

function AddButton() {
  const { t } = useI18n();
  const { addRule, addAction, addMarker, addDirective } = useRule();
  const { expandNext } = useBuilderView();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const [picking, setPicking] = useState<'closed' | 'awaiting' | 'open'>('closed');

  const pick = (action: () => void) => () => {
    setAnchor(null);
    action();
  };

  return (
    <>
      <Button
        size="small"
        variant="contained"
        startIcon={<AddIcon />}
        endIcon={<ArrowDropDownIcon />}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {t('builder.add')}
      </Button>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{
          transition: {
            onExited: () => setPicking((state) => (state === 'awaiting' ? 'open' : state)),
          },
        }}
      >
        <MenuItem
          onClick={pick(() => {
            expandNext();
            addRule();
          })}
        >
          {t('builder.addRule')}
        </MenuItem>
        <MenuItem
          onClick={pick(() => {
            expandNext();
            addAction();
          })}
        >
          {t('builder.addAction')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={pick(addMarker)}>{t('builder.addMarker')}</MenuItem>
        <MenuItem onClick={pick(() => setPicking('awaiting'))}>
          {t('builder.addDirective')}
        </MenuItem>
      </Menu>

      <AddDirectiveDialog
        open={picking === 'open'}
        onClose={() => setPicking('closed')}
        onAdd={(line) => {
          expandNext();
          addDirective(line);
        }}
      />
    </>
  );
}

export function EditorToolbar({ tab }: { tab: EditorTab }) {
  return (
    <Stack
      direction="row"
      sx={{
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: `${GROUP_GAP}px`,
        pl: 1,
        pr: 1.5,
      }}
    >
      {tab === 'visual' && <ExpansionControls />}
      {tab === 'text' ? <FormatButton /> : <AddButton />}
    </Stack>
  );
}
