import type { ModsecPolicy } from "../../../api.ts";
import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createRuleSet,
  deleteRuleSet,
  fetchRuleFiles,
  fetchRuleSet,
  fetchRuleSets,
  restoreRuleSet,
  sendRules,
  updateRuleSet,
  type RuleFileMeta,
  type RuleSet,
  type RuleSetMeta,
  type RulesSendResult,
} from "../../../api.ts";

interface ProfilesState {
  rows: RuleSetMeta[];
  detail: RuleSet | null;
  lists: RuleFileMeta[];
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
  sending: boolean;
  lastSend: RulesSendResult | null;
}

const initialState: ProfilesState = {
  rows: [],
  detail: null,
  lists: [],
  panelId: undefined,
  loading: true,
  error: null,
  sending: false,
  lastSend: null,
};

export const loadProfiles = createAsyncThunk(
  "pages/profiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as RuleSetMeta[];
    }
    try {
      return await fetchRuleSets(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadProfileLists = createAsyncThunk(
  "pages/profiles/loadLists",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as RuleFileMeta[];
    }
    try {
      return await fetchRuleFiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadProfileDetail = createAsyncThunk(
  "pages/profiles/detail",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchRuleSet(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveProfileThunk = createAsyncThunk(
  "pages/profiles/save",
  async (
    input: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      files: string[];
      /** Наборы вида content под операторы `*FromFile`. */
      dataFiles: string[];
      /** Политика профиля: обе стороны канала действий. У нового её нет. */
      policy?: ModsecPolicy;
    },
    { rejectWithValue },
  ) => {
    try {
      if (input.id === null) {
        await createRuleSet(input.scope, {
          name: input.name,
          description: input.description,
          files: input.files,
          data_files: input.dataFiles,
        });
      } else {
        await updateRuleSet(input.scope, input.id, {
          name: input.name,
          description: input.description,
          files: input.files,
          data_files: input.dataFiles,
          policy: input.policy,
        });
      }
      return await fetchRuleSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Копия профиля под новым именем.
 *
 * Состав лежит в детали -- список отдаёт мету со счётчиком, -- поэтому копия
 * сперва читает образец. Политика при этом не переезжает: `POST` её не
 * принимает, и копия начинает с чистой политики, как и копия из карточки.
 */
export const copyProfileThunk = createAsyncThunk(
  "pages/profiles/copy",
  async (
    input: { scope: string; id: string; name: string },
    { rejectWithValue },
  ) => {
    try {
      const source = await fetchRuleSet(input.scope, input.id);
      await createRuleSet(input.scope, {
        name: input.name,
        description: source.description,
        files: source.files.map((file) => file.uuid),
        data_files: source.data_files.map((file) => file.uuid),
      });
      return await fetchRuleSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Отказ (default_required, 409 `in_use` с местами) показывает полоса формы:
 * rejected слайс не трогает, форма ловит его через .rejected.match.
 */
/**
 * Вернуть default к поставке -- к составу из сида.
 *
 * Файлы ручка ищет по именам, и чего-то может не оказаться в каталоге:
 * список недостающих возвращается наверх, чтобы карточка сказала об этом, а
 * не молчала о неполном составе.
 */
export const restoreProfileThunk = createAsyncThunk(
  "pages/profiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      const row = await restoreRuleSet(scope, id);

      void dispatch(loadProfiles(scope));
      await dispatch(loadProfileDetail({ scope, id })).unwrap();

      return row.missing_files;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeProfileThunk = createAsyncThunk(
  "pages/profiles/remove",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteRuleSet(input.scope, input.id);
      return await fetchRuleSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendProfilesThunk = createAsyncThunk(
  "pages/profiles/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      return await sendRules(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const profilesSlice = createSlice({
  name: "pages/profiles",
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
    builder.addCase(loadProfiles.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadProfiles.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadProfiles.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadProfileLists.fulfilled, (state, action) => {
      state.lists = action.payload;
    });
    builder.addCase(loadProfileDetail.fulfilled, (state, action) => {
      state.detail = action.payload;
      state.error = null;
    });
    builder.addCase(loadProfileDetail.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(saveProfileThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(copyProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.error = null;
    });
    builder.addCase(removeProfileThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(sendProfilesThunk.pending, (state) => {
      state.sending = true;
    });
    builder.addCase(sendProfilesThunk.fulfilled, (state, action) => {
      state.sending = false;
      state.lastSend = action.payload;
      state.error = null;
    });
    builder.addCase(sendProfilesThunk.rejected, (state, action) => {
      state.sending = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = profilesSlice.actions;
export default profilesSlice.reducer;
