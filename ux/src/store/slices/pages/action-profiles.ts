import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteActionProfile,
  fetchActionProfile,
  fetchActionProfiles,
  fetchInspectors,
  restoreActionProfile,
  saveActionProfile,
  sendActionProfiles,
  type ActionProfile,
  type ActionProfileDoc,
  type InspectorMeta,
} from "../../../api.ts";

/*
 * Страница профилей инспектора действий. Каркас тот же, что у контракта
 * (json.ts); из справочников нужен один -- реестр инспекторов контура: по нему
 * форма предлагает адресатов просьб.
 */
interface ActionProfilesState {
  rows: ActionProfile[];
  detail: ActionProfile | null;
  inspectors: InspectorMeta[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: ActionProfilesState = {
  rows: [],
  detail: null,
  inspectors: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadActionProfiles = createAsyncThunk(
  "pages/actionProfiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as ActionProfile[];
    }

    try {
      return await fetchActionProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadActionInspectors = createAsyncThunk(
  "pages/actionProfiles/loadInspectors",
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

export const loadActionProfileDetail = createAsyncThunk(
  "pages/actionProfiles/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchActionProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveActionProfileThunk = createAsyncThunk(
  "pages/actionProfiles/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: ActionProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveActionProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadActionProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Копия профиля под новым именем.
 *
 * Образец перечитывается с сервера, а не берётся из строки списка: список мог
 * устареть, а копия -- ровно то место, где расхождение заметят последним.
 * Ошибку показывает окно копии, поэтому в `state.error` она не идёт.
 */
export const copyActionProfile = createAsyncThunk(
  "pages/actionProfiles/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchActionProfile(scope, id);
      await saveActionProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadActionProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Вернуть default к поставке.
 *
 * Карточка перечитывается загрузкой детали, а не строкой из ответа: форма
 * держит поля от `detail`, и половина состояния из ответа, половина из старой
 * детали разошлась бы. Список -- следом: в нём видно описание.
 */
export const restoreActionProfileThunk = createAsyncThunk(
  "pages/actionProfiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreActionProfile(scope, id);
      void dispatch(loadActionProfiles(scope));

      return await dispatch(loadActionProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeActionProfile = createAsyncThunk(
  "pages/actionProfiles/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteActionProfile(scope, id);
      void dispatch(loadActionProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendAction = createAsyncThunk(
  "pages/actionProfiles/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendActionProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/actionProfiles",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
      state.detail = null;
    },
    closePanel(state) {
      state.panelId = undefined;
      state.detail = null;
    },
    clearSent(state) {
      state.sent = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadActionProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadActionProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadActionProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadActionInspectors.fulfilled, (state, action) => {
        state.inspectors = action.payload;
      })
      .addCase(loadActionProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveActionProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveActionProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeActionProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeActionProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendAction.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendAction.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendAction.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
