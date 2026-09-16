import { useEffect, useRef, useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RawOnIcon from '@mui/icons-material/RawOn';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type { ChipProps } from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';
import { MiniEditorPane } from './MiniEditorPane';
import { useBuilderView } from '../context/builderViewContext';
import { useEditorView } from '../context/editorViewContext';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';

const ARM_DELAY_MS = 200;

export interface BlockPreviewHints {
  reveal: string;
  peek: string;
  text: string;
}

export interface BlockPreviewProps {
  file: string;
  blockKey: string;
  caption: string;
  hints: BlockPreviewHints;
  preview?: boolean;
  mode?: 'chip' | 'icons';
  onNavigate?: () => void;
  chipColor?: ChipProps['color'];
  chipVariant?: ChipProps['variant'];
  chipSx?: SxProps<Theme>;
}

export function BlockPreview({
  file,
  blockKey,
  caption,
  hints,
  preview = true,
  mode = 'chip',
  onNavigate,
  chipColor,
  chipVariant,
  chipSx,
}: BlockPreviewProps) {
  const { t } = useI18n();
  const { revealRule } = useBuilderView();
  const { revealLine } = useEditorView();
  const { nameOf, snippetOf } = useWorkspace();
  const [armed, setArmed] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileName = nameOf(file);

  const snippet = tipOpen || modalOpen ? snippetOf(file, blockKey) : null;

  useEffect(() => {
    return () => {
      if (armTimer.current !== null) clearTimeout(armTimer.current);
    };
  }, []);

  const clearArmTimer = () => {
    if (armTimer.current === null) return;
    clearTimeout(armTimer.current);
    armTimer.current = null;
  };

  const armAndOpenTip = () => {
    setArmed(true);
    if (!modalOpen) setTipOpen(true);
  };

  const scheduleArm = () => {
    if (armed || armTimer.current !== null) return;
    armTimer.current = setTimeout(() => {
      armTimer.current = null;
      armAndOpenTip();
    }, ARM_DELAY_MS);
  };

  const goVisual = () => {
    clearArmTimer();
    onNavigate?.();
    revealRule(blockKey, file);
  };

  const leavePreview = () => {
    setTipOpen(false);
    setModalOpen(false);
  };

  const openText = () => {
    clearArmTimer();
    const found = snippetOf(file, blockKey);
    if (found === null) return;
    leavePreview();
    onNavigate?.();
    revealLine(found.startLine, file);
  };

  const openFile = () => {
    leavePreview();
    onNavigate?.();
    revealLine(1, file);
  };

  const openModal = () => {
    setTipOpen(false);
    setModalOpen(true);
  };

  const openFileLabel =
    fileName === '' ? undefined : t('builder.rulePreviewOpenFile', { file: fileName });
  const openLinesLabel =
    snippet === null
      ? undefined
      : snippet.startLine === snippet.endLine
        ? t('builder.rulePreviewOpenLines', { line: String(snippet.startLine) })
        : t('builder.rulePreviewOpenLinesRange', {
            from: String(snippet.startLine),
            to: String(snippet.endLine),
          });

  const textControl = (
    <IconButton
      component="span"
      size="small"
      aria-label={hints.text}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        openText();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.stopPropagation();
        event.preventDefault();
        openText();
      }}
      sx={{
        p: 0,
        px: 0.5,
        m: 0,
        ml: 0.5,
        alignSelf: 'stretch',
        borderRadius: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
        color: 'inherit',
        '& .MuiSvgIcon-root': { fontSize: 22 },
      }}
    >
      <RawOnIcon />
    </IconButton>
  );

  const idleHoverProps =
    preview && !armed
      ? {
          onMouseEnter: scheduleArm,
          onMouseLeave: clearArmTimer,
        }
      : {};

  const chip = (
    <Chip
      size="small"
      component="button"
      color={chipColor}
      variant={chipVariant}
      {...idleHoverProps}
      label={
        preview ? (
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'stretch', height: '100%' }}
          >
            <Box
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', pr: 0.5 }}
            >
              {caption}
            </Box>
            {textControl}
          </Box>
        ) : (
          caption
        )
      }
      onClick={goVisual}
      aria-label={hints.reveal}
      sx={[
        {
          flexShrink: 0,
          ...(preview
            ? {
                overflow: 'hidden',
                '& .MuiChip-label': { pr: 0, py: 0, display: 'flex', height: '100%' },
              }
            : {}),
        },
        ...(chipSx === undefined ? [] : Array.isArray(chipSx) ? chipSx : [chipSx]),
      ]}
    />
  );

  if (!preview && mode === 'chip') return chip;

  const tipTitle =
    !tipOpen
      ? ''
      : snippet === null
        ? hints.peek
        : (
            <MiniEditorPane
              variant="compact"
              text={snippet.text}
              startLine={snippet.startLine}
              fileName={fileName}
              openFileLabel={openFileLabel}
              onOpenFile={openFile}
              openLinesLabel={openLinesLabel}
              onOpenLines={openText}
              expandLabel={t('builder.rulePreviewExpand')}
              onExpand={openModal}
              closeLabel={t('app.close')}
              onClose={() => setTipOpen(false)}
            />
          );

  const withTip = (trigger: ReactElement) => {
    if (!armed) return trigger;

    return (
      <Tooltip
        title={tipTitle}
        placement="top"
        open={tipOpen}
        onOpen={() => {
          if (!modalOpen) setTipOpen(true);
        }}
        onClose={() => setTipOpen(false)}
        disableInteractive={false}
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: 'transparent',
              p: 0,
              maxWidth: 'none',
              boxShadow: 'none',
            },
          },
        }}
      >
        {trigger}
      </Tooltip>
    );
  };

  const modal =
    !modalOpen || snippet === null ? null : (
      <Dialog
        open
        onClose={() => setModalOpen(false)}
        fullWidth
        maxWidth="lg"
        slotProps={{
          paper: {
            sx: {
              height: '80vh',
              bgcolor: '#1e1e1e',
              backgroundImage: 'none',
            },
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            '&.MuiDialogContent-root': { pt: 0 },
          }}
        >
          <MiniEditorPane
            variant="expanded"
            text={snippet.text}
            startLine={snippet.startLine}
            fileName={fileName}
            ruleAction={
              <BlockPreview
                file={file}
                blockKey={blockKey}
                caption={caption}
                hints={hints}
                preview={false}
                chipColor={chipColor}
                chipVariant={chipVariant}
                chipSx={chipSx}
                onNavigate={() => setModalOpen(false)}
              />
            }
            openFileLabel={openFileLabel}
            onOpenFile={openFile}
            openLinesLabel={openLinesLabel}
            onOpenLines={openText}
            closeLabel={t('app.close')}
            onClose={() => setModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    );

  if (mode === 'icons') {
    return (
      <>
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          {withTip(
            <IconButton
              size="small"
              aria-label={hints.peek}
              onMouseEnter={!armed ? scheduleArm : undefined}
              onMouseLeave={!armed ? clearArmTimer : undefined}
              sx={{ p: 0.25, '& .MuiSvgIcon-root': { fontSize: 18 } }}
            >
              <VisibilityOutlinedIcon />
            </IconButton>,
          )}
          <IconButton
            size="small"
            aria-label={hints.text}
            onClick={openText}
            sx={{ p: 0.25, '& .MuiSvgIcon-root': { fontSize: 18 } }}
          >
            <RawOnIcon />
          </IconButton>
        </Box>
        {modal}
      </>
    );
  }

  return (
    <>
      {withTip(chip)}
      {modal}
    </>
  );
}
