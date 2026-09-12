import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createIpProfile,
  deleteIpProfile,
  fetchActions,
  fetchDatasets,
  fetchDenyResponses,
  fetchInspectors,
  fetchIpProfile,
  fetchIpProfiles,
  fetchIpSets,
  restoreIpProfile,
  updateIpProfile,
  type ActionRegistry,
  type Dataset,
  type DenyResponseRow,
  type IpDefaultAction,
  type IpOutcomeInput,
  type IpProfile,
  type IpProfileMeta,
  type IpRuleInput,
  type IpSetMeta,
  type InspectorMeta,
} from "../../../api.ts";

interface IpProfilesState {
  rows: IpProfileMeta[];
  detail: IpProfile | null;
  /** Наборы, из которых собираются правила. */
  sets: IpSetMeta[];
  /** Активные списки: только в них умеет писать действие «внести в список». */
  live: Dataset[];
  /**
   * Все списки адресов пространства: из них профиль выбирает, что упаковать.
   * Условие строки канала спрашивает объявленный список, и статический годится
   * там ровно так же, как активный.
   */
  lists: Dataset[];
  /** Реестр инспекторов: адресат действия берётся оттуда, а не из головы. */
  inspectors: InspectorMeta[];
  /** Каталог ответов отказа: из него выбирается ответ строки чёрного списка. */
  denyResponses: DenyResponseRow[];
  /**
   * Словарь действий с ручки: глаголы, оси и параметры. Своей копии панель не
   * держит -- иначе новый глагол пришлось бы дописывать и здесь.
   */
  actions: ActionRegistry | null;
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: IpProfilesState = {
  rows: [],
  detail: null,
  sets: [],
  live: [],
  lists: [],
  inspectors: [],
  denyResponses: [],
  actions: null,
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadIpProfiles = createAsyncThunk(
  "pages/ipProfiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as IpProfileMeta[];
    }
    try {
      return await fetchIpProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpProfileSets = createAsyncThunk(
  "pages/ipProfiles/loadSets",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as IpSetMeta[];
    }

    try {
      return await fetchIpSets(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpProfileLive = createAsyncThunk(
  "pages/ipProfiles/loadLive",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as Dataset[];
    }

    try {
      const rows = await fetchDatasets(scope);

      /*
       * Один запрос на оба ответа: «куда можно писать» -- только активные,
       * «что можно упаковать» -- любые списки адресов.
       */
      return rows.filter(
        (row) => row.kind === "list" && (row.type === "ipv4" || row.type === "ip"),
      );
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpProfileInspectors = createAsyncThunk(
  "pages/ipProfiles/loadInspectors",
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

/*
 * Каталог ответов отказа: у строки чёрного списка это имя записи, а не
 * свободная строка. Не доехал -- селектор пуст, уже записанное имя видно как
 * есть.
 */
export const loadIpProfileDenyResponses = createAsyncThunk(
  "pages/ipProfiles/loadDenyResponses",
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

export const loadIpProfileActions = createAsyncThunk(
  "pages/ipProfiles/loadActions",
  async (_: void, { rejectWithValue }) => {
    try {
      return await fetchActions();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpProfileDetail = createAsyncThunk(
  "pages/ipProfiles/detail",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchIpProfile(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveIpProfileThunk = createAsyncThunk(
  "pages/ipProfiles/save",
  async (
    input: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      rules: IpRuleInput[];
      datasets: string[];
      outcomes: IpOutcomeInput[];
      default: IpDefaultAction;
      defaultCode: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const body = {
        name: input.name,
        description: input.description,
        rules: input.rules,
        datasets: input.datasets,
        outcomes: input.outcomes,
        default: input.default,
        default_code: input.defaultCode,
      };

      if (input.id === null) {
        await createIpProfile(input.scope, body);
      } else {
        await updateIpProfile(input.scope, input.id, body);
      }
      return await fetchIpProfiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Копия профиля под новым именем.
 *
 * Правила и исходы лежат в детали -- список отдаёт мету со счётчиком, --
 * поэтому копия сперва читает образец. Ошибку показывает окно копии, поэтому
 * в `state.error` она не идёт.
 */
export const copyIpProfileThunk = createAsyncThunk(
  "pages/ipProfiles/copy",
  async (
    input: { scope: string; id: string; name: string },
    { rejectWithValue },
  ) => {
    try {
      const source = await fetchIpProfile(input.scope, input.id);
      await createIpProfile(input.scope, {
        name: input.name,
        description: source.description,
        rules: source.rules.map(
          (rule): IpRuleInput => ({
            set: rule.set,
            dataset: rule.dataset,
            not: rule.not,
            action: rule.action,
            response: rule.response,
            code: rule.code,
            to: rule.to,
            do: rule.do,
            apply: rule.apply,
            delta: rule.delta,
            value: rule.value,
            counter: rule.counter,
            marker: rule.marker,
            side: rule.side,
            when: rule.when,
            headers: rule.headers,
            args: rule.args,
            body: rule.body,
            force: rule.force,
            list: rule.list,
            ttl: rule.ttl,
            enabled: rule.enabled,
          }),
        ),
        datasets: source.datasets.map((row) => row.uuid),
        outcomes: source.outcomes,
        default: source.default,
        default_code: source.default_code,
      });
      return await fetchIpProfiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Отказ (409 `in_use` с местами) показывает полоса формы, а не алерт страницы:
 * rejected здесь слайс не трогает, форма ловит его через .rejected.match.
 */
/**
 * Вернуть default к поставке.
 *
 * Карточка перечитывается загрузкой детали, а не строкой из ответа: форма
 * держит поля от `detail`, и половина состояния из ответа, половина из старой
 * детали разошлась бы. Список -- следом: в нём видно описание.
 */
export const restoreIpProfileThunk = createAsyncThunk(
  "pages/ipProfiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreIpProfile(scope, id);
      void dispatch(loadIpProfiles(scope));

      return await dispatch(loadIpProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeIpProfileThunk = createAsyncThunk(
  "pages/ipProfiles/remove",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteIpProfile(input.scope, input.id);
      return await fetchIpProfiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const ipProfilesSlice = createSlice({
  name: "pages/ipProfiles",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
      if (action.payload === null) {
        state.detail = null;
      }
    },
    closePanel(state) {
      state.panelId = undefined;
      state.detail = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadIpProfiles.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadIpProfiles.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadIpProfiles.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadIpProfileSets.fulfilled, (state, action) => {
      state.sets = action.payload;
    });
    builder.addCase(loadIpProfileLive.fulfilled, (state, action) => {
      state.lists = action.payload;
      state.live = action.payload.filter((row) => row.active);
    });
    builder.addCase(loadIpProfileInspectors.fulfilled, (state, action) => {
      state.inspectors = action.payload;
    });
    builder.addCase(loadIpProfileDenyResponses.fulfilled, (state, action) => {
      state.denyResponses = action.payload;
    });
    builder.addCase(loadIpProfileActions.fulfilled, (state, action) => {
      state.actions = action.payload;
    });
    builder.addCase(loadIpProfileDetail.fulfilled, (state, action) => {
      state.detail = action.payload;
      state.error = null;
    });
    builder.addCase(loadIpProfileDetail.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveIpProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(saveIpProfileThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(copyIpProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.error = null;
    });
    builder.addCase(removeIpProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
  },
});

export const { openPanel, closePanel } = ipProfilesSlice.actions;
export default ipProfilesSlice.reducer;
