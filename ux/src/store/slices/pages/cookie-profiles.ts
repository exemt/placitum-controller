import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteCookieProfile,
  fetchCookieProfile,
  fetchCookieProfiles,
  fetchInspectors,
  restoreCookieProfile,
  saveCookieProfile,
  sendCookieProfiles,
  type CookieProfile,
  type CookieProfileDoc,
  type InspectorMeta,
} from "../../../api.ts";

/*
 * Страница профилей инспектора куки. Каркас тот же, что у контракта
 * (json.ts); из справочников нужен один -- реестр инспекторов контура: по нему
 * форма предлагает адресатов просьб.
 */
interface CookieProfilesState {
  rows: CookieProfile[];
  detail: CookieProfile | null;
  inspectors: InspectorMeta[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: CookieProfilesState = {
  rows: [],
  detail: null,
  inspectors: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadCookieProfiles = createAsyncThunk(
  "pages/cookieProfiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as CookieProfile[];
    }

    try {
      return await fetchCookieProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCookieInspectors = createAsyncThunk(
  "pages/cookieProfiles/loadInspectors",
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

export const loadCookieProfileDetail = createAsyncThunk(
  "pages/cookieProfiles/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchCookieProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveCookieProfileThunk = createAsyncThunk(
  "pages/cookieProfiles/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: CookieProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveCookieProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadCookieProfiles(args.scope));

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
export const copyCookieProfile = createAsyncThunk(
  "pages/cookieProfiles/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchCookieProfile(scope, id);
      await saveCookieProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadCookieProfiles(scope));

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
export const restoreCookieProfileThunk = createAsyncThunk(
  "pages/cookieProfiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreCookieProfile(scope, id);
      void dispatch(loadCookieProfiles(scope));

      return await dispatch(loadCookieProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeCookieProfile = createAsyncThunk(
  "pages/cookieProfiles/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteCookieProfile(scope, id);
      void dispatch(loadCookieProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendCookie = createAsyncThunk(
  "pages/cookieProfiles/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendCookieProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/cookieProfiles",
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
      .addCase(loadCookieProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadCookieProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadCookieProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadCookieInspectors.fulfilled, (state, action) => {
        state.inspectors = action.payload;
      })
      .addCase(loadCookieProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveCookieProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveCookieProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCookieProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCookieProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendCookie.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendCookie.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendCookie.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
