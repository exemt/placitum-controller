import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteJsonProfile,
  fetchDatasets,
  fetchDenyResponses,
  fetchJsonProfile,
  fetchJsonProfiles,
  restoreJsonProfile,
  saveJsonProfile,
  sendJsonProfiles,
  type Dataset,
  type DenyResponseRow,
  type JsonProfile,
  type JsonProfileDoc,
} from "../../../api.ts";

interface JsonState {
  rows: JsonProfile[];
  detail: JsonProfile | null;
  documents: Dataset[];
  denyResponses: DenyResponseRow[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: JsonState = {
  rows: [],
  detail: null,
  documents: [],
  denyResponses: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadJsonProfiles = createAsyncThunk(
  "pages/json/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as JsonProfile[];
    }

    try {
      return await fetchJsonProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadJsonDocuments = createAsyncThunk(
  "pages/json/loadDocuments",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as Dataset[];
    }

    try {
      const rows = await fetchDatasets(scope);

      return rows.filter((row) => row.kind === "content");
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadJsonDenyResponses = createAsyncThunk(
  "pages/json/loadDenyResponses",
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

export const loadJsonProfileDetail = createAsyncThunk(
  "pages/json/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchJsonProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveJsonProfileThunk = createAsyncThunk(
  "pages/json/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: JsonProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveJsonProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadJsonProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyJsonProfile = createAsyncThunk(
  "pages/json/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchJsonProfile(scope, id);
      await saveJsonProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadJsonProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const restoreJsonProfileThunk = createAsyncThunk(
  "pages/json/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreJsonProfile(scope, id);
      void dispatch(loadJsonProfiles(scope));

      return await dispatch(loadJsonProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeJsonProfile = createAsyncThunk(
  "pages/json/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteJsonProfile(scope, id);
      void dispatch(loadJsonProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendJson = createAsyncThunk(
  "pages/json/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendJsonProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/json",
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
      .addCase(loadJsonProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadJsonProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadJsonProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadJsonDocuments.fulfilled, (state, action) => {
        state.documents = action.payload;
      })
      .addCase(loadJsonDenyResponses.fulfilled, (state, action) => {
        state.denyResponses = action.payload;
      })
      .addCase(loadJsonProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveJsonProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveJsonProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeJsonProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeJsonProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendJson.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendJson.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendJson.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
