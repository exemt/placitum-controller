import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createRuleFile,
  deleteRuleFile,
  fetchRuleFile,
  fetchRuleFiles,
  updateRuleFile,
  type RuleFile,
  type RuleFileMeta,
} from "../../../api.ts";

interface ListsState {
  rows: RuleFileMeta[];
  detail: RuleFile | null;
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: ListsState = {
  rows: [],
  detail: null,
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadLists = createAsyncThunk(
  "pages/lists/load",
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

export const loadListDetail = createAsyncThunk(
  "pages/lists/detail",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchRuleFile(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveListThunk = createAsyncThunk(
  "pages/lists/save",
  async (
    input: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      text_raw: string;
    },
    { rejectWithValue },
  ) => {
    try {
      if (input.id === null) {
        await createRuleFile(input.scope, {
          name: input.name,
          description: input.description,
          text_raw: input.text_raw,
        });
      } else {
        await updateRuleFile(input.scope, input.id, {
          name: input.name,
          description: input.description,
          text_raw: input.text_raw,
        });
      }
      return await fetchRuleFiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyListThunk = createAsyncThunk(
  "pages/lists/copy",
  async (
    input: { scope: string; id: string; name: string },
    { rejectWithValue },
  ) => {
    try {
      const source = await fetchRuleFile(input.scope, input.id);
      await createRuleFile(input.scope, {
        name: input.name,
        description: source.description,
        text_raw: source.text_raw,
      });
      return await fetchRuleFiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeListThunk = createAsyncThunk(
  "pages/lists/remove",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteRuleFile(input.scope, input.id);
      return await fetchRuleFiles(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const listsSlice = createSlice({
  name: "pages/lists",
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
    builder.addCase(loadLists.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadLists.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadLists.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadListDetail.fulfilled, (state, action) => {
      state.detail = action.payload;
      state.error = null;
    });
    builder.addCase(loadListDetail.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveListThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(saveListThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(copyListThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.error = null;
    });
    builder.addCase(removeListThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
  },
});

export const { openPanel, closePanel } = listsSlice.actions;
export default listsSlice.reducer;
