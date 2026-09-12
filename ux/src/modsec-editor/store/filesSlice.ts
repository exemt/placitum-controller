import { createSlice, nanoid } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { parseModsec } from '../modsec/parser';
import type { ParsedDocument } from '../modsec/types';
import type { AppThunk } from './index';

/** Максимальная глубина истории отмены — у каждого файла своя. */
const HISTORY_LIMIT = 200;
/** Окно коалесинга набора текста в один шаг истории (мс). */
const COALESCE_MS = 500;

/** Имя, под которым заводят и выгружают файл, у которого имени нет. */
export const DEFAULT_NAME = 'rules.conf';

/**
 * Файл набора: текст, его разбор и всё, что относится к нему одному.
 *
 * История отмены живёт у файла, а не у набора: отмена, правящая файл, которого
 * не видно, — это правка вслепую. По той же причине у файла свой `baseline`:
 * «правлен» — свойство файла, и один правленый файл не должен спрашивать
 * разрешения на замену остальных.
 */
export interface EditorFile {
  /** Идентификатор: им подписаны ссылки, отметки и замечания. */
  id: string;
  /** Имя файла: оно же имя выгрузки и подпись в выборе раздела. */
  name: string;
  /** «Сырой» текст файла — единственный источник правды. */
  source: string;
  /** Результат разбора `source`. */
  parsed: ParsedDocument | null;
  /** Сообщение об ошибке разбора, если парсер неожиданно упал. */
  parseError: string | null;
  /** Стек прошлых версий текста для отмены. */
  past: string[];
  /** Стек отменённых версий для повтора. */
  future: string[];
  /** Текст на момент последнего открытия или сохранения. */
  baseline: string;
  /**
   * Ключ файла у того, кто его хранит: в панели -- uuid набора правил.
   *
   * Идентификатор редактора (`id`) для этого не годится: он живёт одно окно,
   * а запись адресуется записи каталога. Ключа нет у файла, которого в
   * каталоге не заводили, -- так открывают одинокий текст в карточке набора,
   * где запись делает сама карточка.
   */
  key?: string;
}

export interface FilesState {
  /** Файлы в порядке включения: он же порядок для анализа и склейки. */
  files: EditorFile[];
  /** Файл, который правят. Пустая строка — набор ещё не засеян. */
  activeId: string;
}

const initialState: FilesState = { files: [], activeId: '' };

/** Файл набора и его разбор — то, чем набор заводят и заменяют. */
export interface NewFile {
  name: string;
  source: string;
  /** Ключ у хранителя файла; см. {@link EditorFile.key}. */
  key?: string;
  /**
   * Текст, который считается сохранённым, когда он не равен `source`.
   *
   * Так открывают файл, у которого на руках уже есть черновик: форма панели
   * правила текст, но не записала, -- и редактор обязан показать этот файл
   * правленым, а не притвориться, что черновик и есть сохранённое.
   */
  baseline?: string;
}

function makeFile({ name, source, key, baseline }: NewFile): EditorFile {
  const file: EditorFile = {
    id: nanoid(6),
    name,
    source,
    parsed: null,
    parseError: null,
    past: [],
    future: [],
    baseline: baseline ?? source,
    key,
  };
  reparse(file, source);
  return file;
}

/** Пере-парсит текст и записывает результат/ошибку в файл. */
function reparse(file: EditorFile, source: string): void {
  file.source = source;
  try {
    file.parsed = parseModsec(source);
    file.parseError = null;
  } catch (error) {
    file.parseError = error instanceof Error ? error.message : String(error);
  }
}

/**
 * Свободное имя в наборе.
 *
 * Занятое имя не запрещено движком, но в выборе раздела два одинаковых имени
 * означают выбор наугад, а в выгрузке — второй файл поверх первого. Номер
 * приписывается перед расширением: `rules.conf`, `rules-2.conf`.
 */
export function freeName(taken: readonly string[], wanted: string): string {
  if (!taken.includes(wanted)) return wanted;

  const dot = wanted.lastIndexOf('.');
  const stem = dot <= 0 ? wanted : wanted.slice(0, dot);
  const ext = dot <= 0 ? '' : wanted.slice(dot);

  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** Файл, который правят, — или ничего, пока набор не засеян. */
export function selectActive(state: FilesState): EditorFile | undefined {
  return state.files.find((file) => file.id === state.activeId);
}

/** Текст активного файла: им проверяют результат правки. */
export function selectSource(state: FilesState): string {
  return selectActive(state)?.source ?? '';
}

interface CommitPayload {
  id: string;
  source: string;
  parsed: ParsedDocument | null;
  parseError: string | null;
  /** Положить прежний текст в историю (шаг undo). */
  pushHistory: boolean;
}

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    /**
     * Применяет новый текст к файлу: обновляет `source`/`parsed`/`parseError`
     * и, если запрошено, кладёт прежний текст в стек отмены. При ошибке
     * разбора прежняя объектная модель сохраняется (канвас не «моргает» на
     * невалидном промежуточном вводе).
     */
    commit(state, action: PayloadAction<CommitPayload>) {
      const { id, source, parsed, parseError, pushHistory } = action.payload;
      const file = state.files.find((f) => f.id === id);
      if (file === undefined) return;

      if (pushHistory && file.source !== source) {
        file.past.push(file.source);
        if (file.past.length > HISTORY_LIMIT) file.past.shift();
        file.future = [];
      }
      file.source = source;
      if (parseError !== null) {
        file.parseError = parseError;
      } else {
        file.parsed = parsed;
        file.parseError = null;
      }
    },
    undo(state) {
      const file = selectActive(state);
      const prev = file?.past.pop();
      if (file === undefined || prev === undefined) return;
      file.future.unshift(file.source);
      reparse(file, prev);
    },
    redo(state) {
      const file = selectActive(state);
      const next = file?.future.shift();
      if (file === undefined || next === undefined) return;
      file.past.push(file.source);
      reparse(file, next);
    },

    /** Набор целиком: единственный способ его засеять. */
    replaceWorkspace(state, action: PayloadAction<{ files: NewFile[]; activeAt?: number }>) {
      const { files, activeAt = 0 } = action.payload;
      const taken: string[] = [];
      state.files = files.map((file) => {
        const name = freeName(taken, file.name);
        taken.push(name);
        return makeFile({ ...file, name });
      });
      state.activeId = state.files[activeAt]?.id ?? state.files[0]?.id ?? '';
    },

    select(state, action: PayloadAction<string>) {
      if (state.files.some((file) => file.id === action.payload)) {
        state.activeId = action.payload;
      }
    },

    /**
     * Убирает файл из набора.
     *
     * Пустым набор не остаётся: конфигурация без файлов — это редактор без
     * текста, а закрыть его некуда. Последний файл поэтому не убирают вовсе —
     * об этом заботится вызывающий.
     */
    removeFile(state, action: PayloadAction<string>) {
      const at = state.files.findIndex((file) => file.id === action.payload);
      if (at < 0) return;
      state.files.splice(at, 1);
      if (state.activeId !== action.payload) return;
      // Взгляд переходит на соседа снизу, а у последнего — на соседа сверху:
      // так место в списке остаётся тем же, что и было.
      state.activeId = (state.files[at] ?? state.files[at - 1])?.id ?? '';
    },

    /** Переставляет файл: порядок набора — это порядок включения. */
    moveFile(state, action: PayloadAction<{ id: string; to: number }>) {
      const { id, to } = action.payload;
      const from = state.files.findIndex((file) => file.id === id);
      if (from < 0 || to < 0 || to >= state.files.length || to === from) return;
      const [moved] = state.files.splice(from, 1);
      state.files.splice(to, 0, moved);
    },

    /** Файл записан — с этого места и считаем правки. */
    markSaved(state, action: PayloadAction<string>) {
      const file = state.files.find((f) => f.id === action.payload);
      if (file !== undefined) file.baseline = file.source;
    },
  },
});

export const {
  commit,
  undo,
  redo,
  replaceWorkspace,
  select,
  removeFile,
  moveFile,
  markSaved,
} = filesSlice.actions;
export const filesReducer = filesSlice.reducer;

/** Режим влияния изменения на историю отмены. */
export type HistoryMode = 'coalesce' | 'push' | 'skip';

/**
 * Когда в последний раз коммитили в этот файл.
 *
 * По файлу, а не одним числом на набор: набор текста склеивается в один шаг
 * истории, и переход к другому файлу такой шаг заканчивает.
 */
const lastCommitAt = new Map<string, number>();

/**
 * Единая точка изменения текста: раскладывает его в объектную модель и
 * коммитит результат в активный файл. `mode` управляет историей:
 *  - `push` — всегда отдельный шаг undo (структурные правки канваса);
 *  - `skip` — без истории (первичная загрузка);
 *  - `coalesce` — набор текста склеивается в один шаг в пределах окна.
 */
export const applyRuleSource =
  (source: string, mode: HistoryMode = 'coalesce'): AppThunk =>
  (dispatch, getState) => {
    const id = getState().files.activeId;
    // Текст пришёл, а файла нет: так набор засеивают одним документом — из
    // примера, из черновика или из теста. Отказаться было бы честно ровно
    // настолько же, насколько бесполезно: положить его больше некуда.
    if (id === '') {
      dispatch(replaceWorkspace({ files: [{ name: DEFAULT_NAME, source }] }));
      return;
    }

    const now = Date.now();
    let pushHistory: boolean;
    if (mode === 'skip') pushHistory = false;
    else if (mode === 'push') pushHistory = true;
    else pushHistory = now - (lastCommitAt.get(id) ?? 0) > COALESCE_MS;
    lastCommitAt.set(id, now);

    let parsed: ParsedDocument | null = null;
    let parseError: string | null = null;
    try {
      parsed = parseModsec(source);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    dispatch(commit({ id, source, parsed, parseError, pushHistory }));
  };
