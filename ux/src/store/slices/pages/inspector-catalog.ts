import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  fetchInspector,
  fetchInspectors,
  updateInspector,
  type Inspector,
  type InspectorLogLevel,
  type InspectorMeta,
} from "../../../api.ts";

/*
 * Каталог -- справочник процессов, а не заводимые руками записи: строки
 * приезжают с поставкой, имена для маршрутов объявляют в настройках. Панель
 * правит витрину записи -- описание, -- inspector.conf и уровень журнала
 * процесса, поэтому у страницы нет ни create, ни delete. Тема, фазы и ссылка
 * на доки прибиты к процессу: PATCH их не шлёт, на сервере coalesce оставляет
 * прежние.
 *
 * Уровень журнала -- единственное поле, которое отсюда доезжает до процесса:
 * блоком settings его поколения при следующей рассылке канала, без рестарта.
 */

interface InspectorCatalogState {
  rows: InspectorMeta[];
  detail: Inspector | null;
  panelId: string | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: InspectorCatalogState = {
  rows: [],
  detail: null,
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadInspectors = createAsyncThunk(
  "pages/inspectorCatalog/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as InspectorMeta[];
    }
    try {
      return await fetchInspectors(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadInspectorDetail = createAsyncThunk(
  "pages/inspectorCatalog/detail",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchInspector(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveInspectorThunk = createAsyncThunk(
  "pages/inspectorCatalog/save",
  async (
    input: {
      scope: string;
      id: string;
      description: string;
      logLevel: InspectorLogLevel;
      conf: string;
    },
    { rejectWithValue },
  ) => {
    try {
      await updateInspector(input.scope, input.id, {
        description: input.description,
        log_level: input.logLevel,
        conf: input.conf,
      });
      return await fetchInspectors(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const inspectorCatalogSlice = createSlice({
  name: "pages/inspectorCatalog",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string>) {
      state.panelId = action.payload;
    },
    closePanel(state) {
      state.panelId = undefined;
      state.detail = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadInspectors.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadInspectors.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadInspectors.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadInspectorDetail.fulfilled, (state, action) => {
      state.detail = action.payload;
      state.error = null;
    });
    builder.addCase(loadInspectorDetail.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveInspectorThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(saveInspectorThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = inspectorCatalogSlice.actions;
export default inspectorCatalogSlice.reducer;
