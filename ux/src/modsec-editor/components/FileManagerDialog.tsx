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

/**
 * Свой вид переносимого в буфере перетаскивания.
 *
 * По нему перестановка строки отличается от файла, притащенного с рабочего
 * стола: у обоих одно и то же событие, и без метки список принимал бы файл
 * системы за свою строку.
 */
const ROW_MIME = 'application/x-exeditor-row';

/**
 * Файлы профиля: порядок чтения, выгрузка, снятие с профиля.
 *
 * Порядок здесь — не оформление. ModSecurity читает включённые файлы подряд, и
 * исключение действует только на правила, прочитанные раньше него: переставить
 * файл значит изменить, до кого дотягиваются его директивы. Поэтому у строк есть
 * номера, а перенос показывает, куда файл встанет, — и то и другое о порядке
 * чтения, а не о виде списка.
 *
 * Пополнять профиль отсюда нельзя: файл правил — запись каталога наборов, и
 * добавляют её в профиль селектором в карточке профиля. Обратное действие
 * здесь есть: убрать набор из профиля — это правка порядка чтения, того же
 * рода, что перестановка. Сам набор при этом остаётся в каталоге.
 *
 * Выгрузка из строки отдаёт один файл как есть — его кладут в чужое дерево
 * конфигурации, где имя и место уже заданы. Все файлы уходят архивом из
 * меню: здесь этой кнопке делать нечего, окно про порядок, а не про выгрузку.
 * Сохранением выгрузка не считается: сохранённое — то, что записал контроллер.
 */
export function FileManagerDialog({ open, onClose }: FileManagerDialogProps) {
  const { t } = useI18n();
  const { files, activeId, selectFile, removeFile, moveFile, textOf } = useWorkspace();

  /** Строка, которую тащат, и строка, над которой её держат. */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const [pending, setPending] = useState<WorkspaceFile | null>(null);

  /**
   * Единственный файл не убирают: профиль без правил не собирается, а чистить
   * файл вместо этого значило бы молча стереть его текст записью.
   */
  const lonely = files.length === 1;

  const download = (file: WorkspaceFile) => {
    downloadFile(file.name, textOf(file.id));
  };

  const askRemove = (file: WorkspaceFile) => {
    if (lonely) return;
    // Вопрос задаётся там, где ответ «нет» ещё что-то меняет: у записанного
    // файла терять нечего, и лишний вопрос только мешает.
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

  /**
   * С какой стороны строки встанет переносимый файл.
   *
   * Полоса рисуется тенью внутрь, а не рамкой: рамка добавила бы строке
   * пару пикселей высоты, и список дёргался бы под курсором.
   */
  const edge = (index: number): 'top' | 'bottom' | null => {
    if (dragIndex === null || overIndex !== index || dragIndex === index) return null;
    return dragIndex > index ? 'top' : 'bottom';
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        {/* В полосе заголовка стоит имя окна и кнопка закрытия, и больше ничего.
            Фраза о порядке — абзац, а не подпись: поставленная в ту же строку,
            она переносится по второй, третьей и растаскивает полосу тем сильнее,
            чем уже окно. Сказана она над списком, потому что она про список. */}
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
                  {/* Номер — это и есть порядок чтения: по нему говорят «правило
                      из третьего файла», а не «из того, что ниже второго». */}
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
                        // Своя метка в буфере: по ней список отличит перенос
                        // строки от файла, притащенного с рабочего стола.
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

                  {/* Имя — кнопка: выбрать файл здесь же короче, чем закрыть
                      окно и искать его в поле выбора. */}
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
                      {/* Открытый файл назван словом, а не только рамкой: цвет
                          рамки в списке из одного файла ни с чем не сравнить. */}
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
                    {/* Обёртка нужна, чтобы подсказка работала и у выключенной
                        кнопки; имя кнопке приходится дать самой -- подсказка
                        подписывает обёртку, а не её. */}
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
