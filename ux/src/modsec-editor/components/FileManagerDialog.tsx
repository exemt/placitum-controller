import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { ConfirmDialog } from './ConfirmDialog';
import { downloadFile } from './download';
import { useI18n } from '../i18n/useI18n';
import { useWorkspace } from '../context/workspaceContext';
import type { WorkspaceFile } from '../context/workspaceContext';

interface FileManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

const ROW_MIME = 'application/x-exeditor-row';

export function FileManagerDialog({ open, onClose }: FileManagerDialogProps) {
  const { t } = useI18n();
  const { files, activeId, selectFile, removeFile, moveFile, textOf } = useWorkspace();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const [pending, setPending] = useState<WorkspaceFile | null>(null);

  const lonely = files.length === 1;

  const download = (file: WorkspaceFile) => {
    downloadFile(file.name, textOf(file.id));
  };

  const askRemove = (file: WorkspaceFile) => {
    if (lonely) return;
    if (file.edited) setPending(file);
    else removeFile(file.id);
  };

  const move = (from: number, to: number) => {
    const file = files[from];
    if (file !== undefined) moveFile(file.id, to);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const edge = (index: number): 'top' | 'bottom' | null => {
    if (dragIndex === null || overIndex !== index || dragIndex === index) return null;
    return dragIndex > index ? 'top' : 'bottom';
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }} component="div">
          <Typography variant="h6" component="h2" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {t('files.title')}
          </Typography>
          <IconButton onClick={onClose} aria-label={t('app.close')} sx={{ mr: -1 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('files.order')}
          </Typography>

          <Stack
            component="ul"
            spacing={1}
            sx={{ m: 0, p: 0, listStyle: 'none' }}
            aria-label={t('files.list')}
          >
            {files.map((file, index) => {
              const current = file.id === activeId;
              const side = edge(index);

              return (
                <Paper
                  key={file.id}
                  component="li"
                  variant="outlined"
                  onDragOver={(event) => {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    move(dragIndex, index);
                    endDrag();
                  }}
                  sx={(theme) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.75,
                    opacity: dragIndex === index ? 0.4 : 1,
                    borderColor: current ? 'primary.main' : 'divider',
                    boxShadow:
                      side === null
                        ? 'none'
                        : `inset 0 ${side === 'top' ? '' : '-'}2px 0 0 ${theme.palette.primary.main}`,
                  })}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      width: 20,
                      flexShrink: 0,
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {index + 1}
                  </Typography>

                  <Tooltip title={t('files.drag')}>
                    <Box
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(ROW_MIME, String(index));
                        event.dataTransfer.effectAllowed = 'move';
                        setDragIndex(index);
                      }}
                      onDragEnd={endDrag}
                      sx={{ display: 'flex', cursor: 'grab', color: 'text.disabled' }}
                    >
                      <DragIndicatorIcon fontSize="small" />
                    </Box>
                  </Tooltip>

                  <Box
                    component="button"
                    type="button"
                    onClick={() => {
                      selectFile(file.id);
                      onClose();
                    }}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      background: 'none',
                      border: 0,
                      p: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: current ? 600 : 400 }}>
                        {file.name}
                      </Typography>
                      {current && (
                        <Chip label={t('files.current')} size="small" color="primary" variant="outlined" />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {file.lines === 0
                        ? t('files.empty')
                        : t('files.lines', { count: String(file.lines) })}
                      {file.edited ? ` · ${t('files.edited')}` : ''}
                    </Typography>
                  </Box>

                  <Tooltip title={t('files.up')}>
                    <IconButton
                      size="small"
                      disabled={index === 0}
                      aria-label={t('files.up')}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('files.down')}>
                    <IconButton
                      size="small"
                      disabled={index === files.length - 1}
                      aria-label={t('files.down')}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('files.download', { name: file.name })}>
                    <IconButton
                      size="small"
                      aria-label={t('files.download', { name: file.name })}
                      onClick={() => download(file)}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    title={lonely ? t('files.lastFile') : t('files.remove', { name: file.name })}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={lonely}
                        aria-label={t('files.remove', { name: file.name })}
                        onClick={() => askRemove(file)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>{t('app.close')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        title={t('files.removeTitle')}
        body={t('files.removeBody', { name: pending?.name ?? '' })}
        confirmLabel={t('files.removeConfirm')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) removeFile(pending.id);
          setPending(null);
        }}
      />
    </>
  );
}
