import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  addAddress,
  buildAuthUserLine,
  deleteAddress,
  fetchAddresses,
  fetchDatasets,
  fetchDenyResponses,
  fetchLocations,
  fetchServers,
  deleteAuthProfile,
  deleteAuthSource,
  fetchAuthProfile,
  fetchAuthProfiles,
  fetchAuthSource,
  fetchAuthSources,
  restoreAuthProfile,
  saveAuthProfile,
  saveAuthSource,
  sendAuthProfiles,
  type Address,
  type AuthProfile,
  type AuthProfileDoc,
  type AuthSource,
  type AuthSourceDoc,
  type Dataset,
  type DenyResponseRow,
  type RouteLocation,
  type RouteServer,
} from "../../../api.ts";

/*
 * Страница калитки: источники входа и профили. Наборы пользователей лежат
 * здесь же: провайдер local называет набор именем, и выбирать его в форме
 * источника надо из того же списка, который правят рядом.
 */
interface AuthState {
  rows: AuthProfile[];
  detail: AuthProfile | null;
  /* Источники входа: провайдер, форма, сессии. Профили ссылаются на них. */
  sources: AuthSource[];
  sourceDetail: AuthSource | null;
  /* undefined -- панель источника закрыта, null -- создаём новый. */
  sourcePanelId: string | null | undefined;
  /* Списки строк пространства: из них выбирают пользователей провайдера local. */
  userLists: Dataset[];
  /* Записи выбранного списка -- то, что показывает и правит форма профиля. */
  users: Address[];
  usersListId: string | null;
  /*
   * Серверы и наборы -- то, из чего в форме выбирают вместо ввода руками:
   * адрес формы это location сервера, а активный список -- объявленный набор.
   */
  servers: RouteServer[];
  locations: RouteLocation[];
  datasets: Dataset[];
  /* Объекты раздела «Страницы»: из них выбирают свою форму входа. */
  pages: Dataset[];
  /* Каталог отказов: запись выбирают селектором, опечатка не уезжает на край. */
  denyResponses: DenyResponseRow[];
  /* undefined -- панель закрыта, null -- создаём новый. */
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: AuthState = {
  rows: [],
  detail: null,
  sources: [],
  sourceDetail: null,
  sourcePanelId: undefined,
  userLists: [],
  users: [],
  usersListId: null,
  servers: [],
  locations: [],
  datasets: [],
  pages: [],
  denyResponses: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadAuthProfiles = createAsyncThunk(
  "pages/auth/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as AuthProfile[];
    }

    try {
      return await fetchAuthProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthSources = createAsyncThunk(
  "pages/auth/loadSources",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as AuthSource[];
    }

    try {
      return await fetchAuthSources(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthSourceDetail = createAsyncThunk(
  "pages/auth/sourceDetail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchAuthSource(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveAuthSourceThunk = createAsyncThunk(
  "pages/auth/saveSource",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      serverId: string | null;
      doc: AuthSourceDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveAuthSource(args.scope, args.id, {
        name: args.name,
        description: args.description,
        server_id: args.serverId,
        doc: args.doc,
      });

      void dispatch(loadAuthSources(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyAuthSource = createAsyncThunk(
  "pages/auth/copySource",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchAuthSource(scope, id);
      await saveAuthSource(scope, null, {
        name,
        description: source.description,
        server_id: source.server_id,
        doc: source.doc,
      });
      void dispatch(loadAuthSources(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeAuthSource = createAsyncThunk(
  "pages/auth/removeSource",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteAuthSource(scope, id);
      void dispatch(loadAuthSources(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthServers = createAsyncThunk(
  "pages/auth/loadServers",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as RouteServer[];
    }

    try {
      return await fetchServers(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Набор для быстрого пути -- только активный список строк: в него кладут
 * идентификатор сессии, а не адрес, и неактивный набор в шину не едет вовсе.
 */
export const loadAuthDatasets = createAsyncThunk(
  "pages/auth/loadDatasets",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return {
        lists: [] as Dataset[],
        pages: [] as Dataset[],
        userLists: [] as Dataset[],
      };
    }

    try {
      const rows = await fetchDatasets(scope);

      return {
        lists: rows.filter(
          (row) => row.kind === "list" && row.type === "string" && row.active,
        ),
        pages: rows.filter((row) => row.kind === "content"),
        /* Пользователи -- любой список строк: активность тут ни при чём. */
        userLists: rows.filter(
          (row) => row.kind === "list" && row.type === "string",
        ),
      };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthLocations = createAsyncThunk(
  "pages/auth/loadLocations",
  async (
    { scope, serverId }: { scope: string; serverId: string | null },
    { rejectWithValue },
  ) => {
    if (serverId === null) {
      return [] as RouteLocation[];
    }

    try {
      return await fetchLocations(scope, serverId);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthDenyResponses = createAsyncThunk(
  "pages/auth/loadDenyResponses",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as DenyResponseRow[];
    }

    try {
      return await fetchDenyResponses(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAuthProfileDetail = createAsyncThunk(
  "pages/auth/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchAuthProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveAuthProfileThunk = createAsyncThunk(
  "pages/auth/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: AuthProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveAuthProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadAuthProfiles(args.scope));

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
 * устареть, а копия -- то место, где расхождение заметят последним. Ошибку
 * показывает окно копии, поэтому в `state.error` она не идёт.
 */
export const copyAuthProfile = createAsyncThunk(
  "pages/auth/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchAuthProfile(scope, id);
      await saveAuthProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadAuthProfiles(scope));

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
export const restoreAuthProfileThunk = createAsyncThunk(
  "pages/auth/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreAuthProfile(scope, id);
      void dispatch(loadAuthProfiles(scope));

      return await dispatch(loadAuthProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeAuthProfile = createAsyncThunk(
  "pages/auth/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteAuthProfile(scope, id);
      void dispatch(loadAuthProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Разослать -- отдельное действие, а не следствие сохранения. Черновик в базе
 * и поколение на краю живут разными жизнями: правку профиля обычно доводят
 * несколькими шагами, и выкатывать каждый было бы неверно.
 */
export const sendAuth = createAsyncThunk(
  "pages/auth/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendAuthProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Пользователи выбранного списка. Список -- обычный набор строк, поэтому
 * читаем и правим его тем же API, что и любой другой: своей ручки у калитки
 * ровно одна -- посчитать bcrypt.
 *
 * Отказ записи в `state.error` не оседает: правку ведут из окна
 * ([AuthUsersDialog]), и полоса отказа у него своя -- продублированный отказ
 * повис бы ещё и на странице за окном.
 */
export const loadAuthUsers = createAsyncThunk(
  "pages/auth/loadUsers",
  async (
    { scope, datasetId }: { scope: string; datasetId: string | null },
    { rejectWithValue },
  ) => {
    if (datasetId === null) {
      return { datasetId, rows: [] as Address[] };
    }

    try {
      return { datasetId, rows: await fetchAddresses(scope, datasetId) };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const addAuthUser = createAsyncThunk(
  "pages/auth/addUser",
  async (
    args: {
      scope: string;
      datasetId: string;
      login: string;
      password: string;
      groups: string[];
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const line = await buildAuthUserLine(args.scope, {
        login: args.login,
        password: args.password,
        groups: args.groups,
      });

      await addAddress(args.scope, args.datasetId, line);
      void dispatch(loadAuthUsers({ scope: args.scope, datasetId: args.datasetId }));

      return true;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeAuthUser = createAsyncThunk(
  "pages/auth/removeUser",
  async (
    args: { scope: string; datasetId: string; addressId: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await deleteAddress(args.scope, args.addressId);
      void dispatch(loadAuthUsers({ scope: args.scope, datasetId: args.datasetId }));

      return true;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/auth",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
      state.detail = null;
      /* Две панели разом не живут: правка идёт об одной сущности. */
      state.sourcePanelId = undefined;
      state.sourceDetail = null;
    },
    closePanel(state) {
      state.panelId = undefined;
      state.detail = null;
    },
    openSourcePanel(state, action: PayloadAction<string | null>) {
      state.sourcePanelId = action.payload;
      state.sourceDetail = null;
      state.panelId = undefined;
      state.detail = null;
    },
    closeSourcePanel(state) {
      state.sourcePanelId = undefined;
      state.sourceDetail = null;
    },
    clearSent(state) {
      state.sent = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAuthProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadAuthProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadAuthProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadAuthSources.fulfilled, (state, action) => {
        state.sources = action.payload;
      })
      .addCase(loadAuthSources.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadAuthSourceDetail.fulfilled, (state, action) => {
        state.sourceDetail = action.payload;
      })
      .addCase(saveAuthSourceThunk.fulfilled, (state) => {
        state.sourcePanelId = undefined;
        state.sourceDetail = null;
        state.error = null;
      })
      .addCase(saveAuthSourceThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeAuthSource.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeAuthSource.fulfilled, (state) => {
        state.sourcePanelId = undefined;
        state.sourceDetail = null;
      })
      .addCase(loadAuthServers.fulfilled, (state, action) => {
        state.servers = action.payload;
      })
      .addCase(loadAuthDatasets.fulfilled, (state, action) => {
        state.datasets = action.payload.lists;
        state.pages = action.payload.pages;
        state.userLists = action.payload.userLists;
      })
      .addCase(loadAuthDenyResponses.fulfilled, (state, action) => {
        state.denyResponses = action.payload;
      })
      .addCase(loadAuthLocations.fulfilled, (state, action) => {
        state.locations = action.payload;
      })
      .addCase(loadAuthProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(loadAuthUsers.fulfilled, (state, action) => {
        state.users = action.payload.rows;
        state.usersListId = action.payload.datasetId;
      })
      .addCase(saveAuthProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveAuthProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeAuthProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeAuthProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendAuth.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendAuth.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendAuth.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const {
  openPanel,
  closePanel,
  openSourcePanel,
  closeSourcePanel,
  clearSent,
} = slice.actions;

export default slice.reducer;
