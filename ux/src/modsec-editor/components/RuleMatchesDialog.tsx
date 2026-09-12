import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  MiniEditorHead,
  MiniEditorPane,
  lineRangeLabel,
} from './MiniEditorPane';
import { RulePreview } from './RulePreview';
import { VariableUseMarks } from './builder/VariableUseMarks';
import { segmentsOf, visibleRange } from './builder/blockRuns';
import { useEditorView } from '../context/editorViewContext';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';
import type { VariableUse } from '../modsec/variables';
import './MiniEditorPane.css';

/**
 * Шаг свёрнутой строки списка.
 *
 * Совпадает с высотой `.mini-editor--row`: обёртке она задана явно, иначе
 * виртуализация из тысячи строк уехала бы на накопленный пиксель.
 */
const ROW_STEP = 33;

/** Высота раскрытого редактора — тоже навязана, не измерена. */
const EXPANDED_HEIGHT = 280;

interface RuleMatchesDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Номера правил в порядке показа.
   *
   * Откуда каждое правило — знает набор (`ruleOf`), а не вызывающий: диалогу
   * нечего делать со структурой исключения или ключом блока.
   */
  ids: readonly string[];
  /**
   * Имя слева от счётчика — `tx.score · Связанные правила · N`.
   *
   * У переменной без имени окно из поля `setvar` читалось бы как тот же
   * список, что у снятия по метке. Счётчик считает отфильтрованный список,
   * как у исключений: иначе заголовок врал бы после набора в поле id.
   */
  heading?: string;
  /**
   * Виды использования переменной по номеру правила.
   *
   * Только у списка из отметки `setvar`: исключению читать/писать нечего, и
   * значков перед чипом нет. У одного номера видов бывает несколько.
   */
  usesById?: ReadonlyMap<string, readonly VariableUse[]>;
}

/**
 * Подписка на прокрутку и изменение размеров: колбэки зовутся раз в кадр.
 *
 * Та же схема, что у списка блоков конструктора: без неё серия свёрнутых
 * строк узнала бы о переезде только на следующем скролле.
 */
function useViewportTicker(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
): (listener: () => void) => () => void {
  const listeners = useRef(new Set<() => void>());

  useEffect(() => {
    const view = scroller.current;
    if (view === null) return;

    let frame = 0;
    const tick = () => {
      frame = 0;
      for (const listener of listeners.current) listener();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    view.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer !== null && content.current !== null) observer.observe(content.current);

    return () => {
      view.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, content]);

  return useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
}

interface RunProps {
  from: number;
  to: number;
  scroller: RefObject<HTMLElement | null>;
  subscribe: (listener: () => void) => () => void;
  render: (index: number) => ReactNode;
}

/** Серия свёрнутых строк: в DOM только те, что рядом с окном. */
function CollapsedRun({ from, to, scroller, subscribe, render }: RunProps) {
  const count = to - from;
  const box = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, count]);

  const first = Math.min(range[0], count);
  const last = Math.min(range[1], count);

  const measure = useCallback(() => {
    const el = box.current;
    const view = scroller.current;
    if (el === null || view === null) return;

    const height = view.clientHeight;
    // Окно без высоты — среда без раскладки (тесты). Честнее показать всё.
    if (height === 0) {
      setRange((prev) => (prev[0] === 0 && prev[1] === count ? prev : [0, count]));
      return;
    }

    const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top;
    const next = visibleRange(top, height, ROW_STEP, count);
    setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
  }, [count, scroller]);

  useLayoutEffect(measure);
  useEffect(() => subscribe(measure), [subscribe, measure]);

  const rows: ReactNode[] = [];
  for (let offset = first; offset < last; offset++) {
    const index = from + offset;
    rows.push(
      <Box
        key={index}
        sx={{
          position: 'absolute',
          top: offset * ROW_STEP,
          left: 0,
          right: 0,
          height: ROW_STEP,
        }}
      >
        {render(index)}
      </Box>,
    );
  }

  return (
    <Box ref={box} sx={{ position: 'relative', height: count * ROW_STEP }}>
      {rows}
    </Box>
  );
}

/**
 * Список правил по их номерам: раскрытие показывает исходник.
 *
 * Свёрнутая строка — шапка без текста правила; исходник собирается только у
 * раскрытой. Тысяча строк не монтируется целиком: подряд идущие свёрнутые
 * виртуализируются по окну, как серии в списке блоков конструктора.
 */
/** Поля фильтра в тёмной шапке — высота как у соседней кнопки закрытия. */
const filterFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#d4d4d4',
    bgcolor: '#1e1e1e',
    fontSize: 13,
    '& fieldset': { borderColor: '#3c3c3c' },
    '&:hover fieldset': { borderColor: '#6e6e6e' },
    '&.Mui-focused fieldset': { borderColor: '#007acc' },
  },
  '& .MuiSvgIcon-root': { color: '#9aa0a6' },
} as const;

export function RuleMatchesDialog({
  open,
  onClose,
  ids,
  heading,
  usesById,
}: RuleMatchesDialogProps) {
  const { t } = useI18n();
  const { revealLine } = useEditorView();
  const { nameOf, snippetOf, ruleOf } = useWorkspace();
  /** Индекс раскрытой строки в отфильтрованном списке; одновременно открыта одна. */
  const [expanded, setExpanded] = useState<number | null>(null);
  const [idQuery, setIdQuery] = useState('');
  /** Пустая строка — все файлы из списка. */
  const [fileFilter, setFileFilter] = useState('');

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const subscribe = useViewportTicker(scroller, content);

  /**
   * Файлы с числом правил под текущий фильтр id.
   *
   * Нулевые не показываем: выбирать нечего, а счётчик справа объясняет,
   * сколько строк даст каждый файл.
   */
  const fileOptions = useMemo(() => {
    const query = idQuery.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const id of ids) {
      if (query !== '' && !id.toLowerCase().includes(query)) continue;
      const located = ruleOf(id);
      if (located === null) continue;
      counts.set(located.file, (counts.get(located.file) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([file, count]) => ({ file, name: nameOf(file), count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ids, idQuery, ruleOf, nameOf]);

  const byId = useMemo(() => {
    const query = idQuery.trim().toLowerCase();
    return ids.filter((id) => query === '' || id.toLowerCase().includes(query));
  }, [ids, idQuery]);

  const filtered = useMemo(() => {
    if (fileFilter === '') return byId;
    return byId.filter((id) => ruleOf(id)?.file === fileFilter);
  }, [byId, fileFilter, ruleOf]);

  // Смена отбора сбрасывает раскрытие: индекс указывал бы в другой список.
  useEffect(() => {
    setExpanded(null);
  }, [idQuery, fileFilter]);

  // Выбранный файл исчез из списка (фильтр id обнулил его) — вернуть «все».
  useEffect(() => {
    if (fileFilter === '') return;
    if (fileOptions.some((option) => option.file === fileFilter)) return;
    setFileFilter('');
  }, [fileFilter, fileOptions]);

  const isOpen = useCallback((index: number) => expanded === index, [expanded]);
  const segments = segmentsOf(filtered.length, isOpen);

  const reset = () => {
    setExpanded(null);
    setIdQuery('');
    setFileFilter('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        transition: { onExited: reset },
        paper: {
          sx: {
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#1e1e1e',
            backgroundImage: 'none',
            color: '#d4d4d4',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 2,
          pr: 1,
          bgcolor: '#252526',
          borderBottom: '1px solid #3c3c3c',
          color: '#d4d4d4',
        }}
      >
        <Typography
          component="span"
          variant="h6"
          noWrap
          sx={{ flex: 1, minWidth: 0, fontSize: 16 }}
        >
          {heading === undefined || heading === ''
            ? t('builder.rulePreviewListTitle', { count: String(filtered.length) })
            : t('builder.variableSitesTitle', {
                name: heading,
                count: String(filtered.length),
              })}
        </Typography>
        <TextField
          size="small"
          value={idQuery}
          onChange={(event) => setIdQuery(event.target.value)}
          placeholder={t('builder.rulePreviewFilterId')}
          slotProps={{
            htmlInput: { 'aria-label': t('builder.rulePreviewFilterId') },
          }}
          sx={{ width: 140, flexShrink: 0, ...filterFieldSx }}
        />
        <FormControl size="small" sx={{ minWidth: 160, maxWidth: 260, flexShrink: 1, ...filterFieldSx }}>
          <Select
            displayEmpty
            value={fileFilter}
            onChange={(event) => setFileFilter(event.target.value)}
            aria-label={t('builder.rulePreviewFilterFile')}
            renderValue={(value) =>
              value === ''
                ? t('builder.rulePreviewFilterAllFiles')
                : (fileOptions.find((option) => option.file === value)?.name ?? value)
            }
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    bgcolor: '#252526',
                    color: '#d4d4d4',
                    border: '1px solid #3c3c3c',
                    minWidth: 320,
                    '& .MuiMenuItem-root:hover': { bgcolor: '#2a2d2e' },
                    '& .Mui-selected': { bgcolor: '#094771' },
                    '& .Mui-selected:hover': { bgcolor: '#0a5a8c' },
                  },
                },
              },
            }}
          >
            <MenuItem value="">
              <Box sx={{ display: 'flex', width: '100%', gap: 2, alignItems: 'baseline' }}>
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                  {t('builder.rulePreviewFilterAllFiles')}
                </Box>
                <Box component="span" sx={{ color: '#9aa0a6', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {byId.length}
                </Box>
              </Box>
            </MenuItem>
            {fileOptions.map((option) => (
              <MenuItem key={option.file} value={option.file}>
                <Box sx={{ display: 'flex', width: '100%', gap: 2, alignItems: 'baseline' }}>
                  <Box
                    component="span"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {option.name}
                  </Box>
                  <Box
                    component="span"
                    sx={{ color: '#9aa0a6', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {option.count}
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton
          aria-label={t('app.close')}
          onClick={onClose}
          size="small"
          sx={{ color: '#9aa0a6', flexShrink: 0, '&:hover': { color: '#d4d4d4' } }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        ref={scroller}
        sx={{
          p: 0,
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          '&.MuiDialogContent-root': { pt: 0 },
        }}
      >
        {filtered.length === 0 ? (
          <Typography variant="body2" sx={{ p: 2, color: '#9aa0a6' }}>
            {t('builder.rulePreviewFilterEmpty')}
          </Typography>
        ) : (
          <Box ref={content} sx={{ overflowAnchor: 'none' }}>
            {segments.map((segment) =>
              segment.open ? (
                <Box key={`open-${segment.index}`} sx={{ height: EXPANDED_HEIGHT }}>
                  <MatchRow
                    id={filtered[segment.index]}
                    open
                    uses={usesById?.get(filtered[segment.index])}
                    onExpand={() => setExpanded(segment.index)}
                    onCollapse={() => setExpanded(null)}
                    onCloseDialog={onClose}
                    revealLine={revealLine}
                    nameOf={nameOf}
                    snippetOf={snippetOf}
                    ruleOf={ruleOf}
                    t={t}
                  />
                </Box>
              ) : (
                <CollapsedRun
                  key={`run-${segment.from}`}
                  from={segment.from}
                  to={segment.to}
                  scroller={scroller}
                  subscribe={subscribe}
                  render={(index) => (
                    <MatchRow
                      id={filtered[index]}
                      open={false}
                      uses={usesById?.get(filtered[index])}
                      onExpand={() => setExpanded(index)}
                      onCollapse={() => setExpanded(null)}
                      onCloseDialog={onClose}
                      revealLine={revealLine}
                      nameOf={nameOf}
                      snippetOf={snippetOf}
                      ruleOf={ruleOf}
                      t={t}
                    />
                  )}
                />
              ),
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MatchRowProps {
  id: string;
  open: boolean;
  /** Виды использования переменной этим правилом — значки перед чипом. */
  uses?: readonly VariableUse[];
  onExpand: () => void;
  onCollapse: () => void;
  onCloseDialog: () => void;
  revealLine: (line: number, file?: string) => void;
  nameOf: (id: string) => string;
  snippetOf: ReturnType<typeof useWorkspace>['snippetOf'];
  ruleOf: ReturnType<typeof useWorkspace>['ruleOf'];
  t: ReturnType<typeof useI18n>['t'];
}

/**
 * Одна строка списка: шапка или раскрытый редактор.
 *
 * Исходник (`snippetOf`) читается только в раскрытом виде — свёрнутой строке
 * хватает адреса из `ruleOf`, и тысяча шапок не собирает тысячу текстов.
 */
function MatchRow({
  id,
  open,
  uses,
  onExpand,
  onCollapse,
  onCloseDialog,
  revealLine,
  nameOf,
  snippetOf,
  ruleOf,
  t,
}: MatchRowProps) {
  const label = id === '' ? t('builder.unset') : id;
  const located = ruleOf(id);
  const fileName = located === null ? '' : nameOf(located.file);
  const lineLabel =
    located === null ? '' : lineRangeLabel(located.startLine, located.endLine);

  const openFileLabel =
    fileName === '' ? undefined : t('builder.rulePreviewOpenFile', { file: fileName });
  const openLinesLabel =
    located === null
      ? undefined
      : located.startLine === located.endLine
        ? t('builder.rulePreviewOpenLines', { line: String(located.startLine) })
        : t('builder.rulePreviewOpenLinesRange', {
            from: String(located.startLine),
            to: String(located.endLine),
          });

  const openText = () => {
    if (located === null) return;
    onCloseDialog();
    revealLine(located.startLine, located.file);
  };

  const openFile = () => {
    if (located === null) return;
    onCloseDialog();
    revealLine(1, located.file);
  };

  // Значки слева от чипа: сначала «что сделано», потом «какое правило».
  const ruleChip =
    located === null ? undefined : (
      <>
        {uses !== undefined && uses.length > 0 && <VariableUseMarks uses={uses} />}
        <RulePreview
          id={id}
          file={located.file}
          ruleKey={located.key}
          preview={false}
          onNavigate={onCloseDialog}
        />
      </>
    );

  if (!open) {
    return (
      <div className="mini-editor mini-editor--row">
        <MiniEditorHead
          fileName={fileName !== '' ? fileName : label}
          lineLabel={lineLabel}
          onClick={located === null ? undefined : onExpand}
          openFileLabel={openFileLabel}
          onOpenFile={located === null ? undefined : openFile}
          openLinesLabel={openLinesLabel}
          onOpenLines={located === null ? undefined : openText}
          leading={
            <IconButton
              size="small"
              aria-label={t('builder.rulePreviewExpandRow')}
              aria-expanded={false}
              disabled={located === null}
              onClick={onExpand}
              className="mini-editor__action"
            >
              <ExpandMoreIcon fontSize="inherit" />
            </IconButton>
          }
          actions={ruleChip}
        />
      </div>
    );
  }

  // Текст исходника — только здесь: раскрытых строк не больше одной.
  const snippet = located === null ? null : snippetOf(located.file, located.key);

  if (snippet === null || located === null) {
    return (
      <Typography variant="body2" sx={{ p: 2, color: '#9aa0a6' }}>
        {t('builder.rulePreviewMissing')}
      </Typography>
    );
  }

  return (
    <MiniEditorPane
      variant="expanded"
      text={snippet.text}
      startLine={snippet.startLine}
      fileName={fileName}
      ruleAction={ruleChip}
      openFileLabel={openFileLabel}
      onOpenFile={openFile}
      openLinesLabel={openLinesLabel}
      onOpenLines={openText}
      collapseLabel={t('builder.rulePreviewCollapse')}
      onCollapse={onCollapse}
    />
  );
}
