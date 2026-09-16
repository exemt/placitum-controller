import { createSlice, nanoid } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { parseModsec } from '../modsec/parser';
import type { ParsedDocument } from '../modsec/types';
import type { AppThunk } from './index';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 500;

export const DEFAULT_NAME = 'rules.conf';

export interface EditorFile {
  id: string;
  name: string;
  source: string;
  parsed: ParsedDocument | null;
  parseError: string | null;
  past: string[];
  future: string[];
  baseline: string;
  key?: string;
}

export interface FilesState {
  files: EditorFile[];
  activeId: string;
}

const initialState: FilesState = { files: [], activeId: '' };

export interface NewFile {
  name: string;
  source: string;
  key?: string;
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

function reparse(file: EditorFile, source: string): void {
  file.source = source;
  try {
    file.parsed = parseModsec(source);
    file.parseError = null;
  } catch (error) {
    file.parseError = error instanceof Error ? error.message : String(error);
  }
}

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

export function selectActive(state: FilesState): EditorFile | undefined {
  return state.files.find((file) => file.id === state.activeId);
}

export function selectSource(state: FilesState): string {
  return selectActive(state)?.source ?? '';
}

interface CommitPayload {
  id: string;
  source: string;
  parsed: ParsedDocument | null;
  parseError: string | null;
  pushHistory: boolean;
}

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
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

    removeFile(state, action: PayloadAction<string>) {
      const at = state.files.findIndex((file) => file.id === action.payload);
      if (at < 0) return;
      state.files.splice(at, 1);
      if (state.activeId !== action.payload) return;
      state.activeId = (state.files[at] ?? state.files[at - 1])?.id ?? '';
    },

    moveFile(state, action: PayloadAction<{ id: string; to: number }>) {
      const { id, to } = action.payload;
      const from = state.files.findIndex((file) => file.id === id);
      if (from < 0 || to < 0 || to >= state.files.length || to === from) return;
      const [moved] = state.files.splice(from, 1);
      state.files.splice(to, 0, moved);
    },

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

export type HistoryMode = 'coalesce' | 'push' | 'skip';

const lastCommitAt = new Map<string, number>();

export const applyRuleSource =
  (source: string, mode: HistoryMode = 'coalesce'): AppThunk =>
  (dispatch, getState) => {
    const id = getState().files.activeId;
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
