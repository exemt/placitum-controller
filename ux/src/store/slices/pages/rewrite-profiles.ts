import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteRewriteProfile,
  fetchDenyResponses,
  fetchRewriteProfile,
  fetchRewriteProfiles,
  restoreRewriteProfile,
  saveRewriteProfile,
  sendRewriteProfiles,
  type DenyResponseRow,
  type RewriteProfile,
  type RewriteProfileDoc,
} from "../../../api.ts";

interface RewriteProfilesState {
  rows: RewriteProfile[];
  detail: RewriteProfile | null;
  denyResponses: DenyResponseRow[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: RewriteProfilesState = {
  rows: [],
  detail: null,
  denyResponses: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadRewriteProfiles = createAsyncThunk(
  "pages/rewriteProfiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as RewriteProfile[];
    }

    try {
      return await fetchRewriteProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadRewriteDenyResponses = createAsyncThunk(
  "pages/rewriteProfiles/loadDenyResponses",
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

export const loadRewriteProfileDetail = createAsyncThunk(
  "pages/rewriteProfiles/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchRewriteProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveRewriteProfileThunk = createAsyncThunk(
  "pages/rewriteProfiles/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: RewriteProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveRewriteProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadRewriteProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyRewriteProfile = createAsyncThunk(
  "pages/rewriteProfiles/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchRewriteProfile(scope, id);
      await saveRewriteProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadRewriteProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const restoreRewriteProfileThunk = createAsyncThunk(
  "pages/rewriteProfiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreRewriteProfile(scope, id);
      void dispatch(loadRewriteProfiles(scope));

      return await dispatch(loadRewriteProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeRewriteProfile = createAsyncThunk(
  "pages/rewriteProfiles/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteRewriteProfile(scope, id);
      void dispatch(loadRewriteProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendRewrite = createAsyncThunk(
  "pages/rewriteProfiles/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendRewriteProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/rewriteProfiles",
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
      .addCase(loadRewriteProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadRewriteProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadRewriteProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadRewriteDenyResponses.fulfilled, (state, action) => {
        state.denyResponses = action.payload;
      })
      .addCase(loadRewriteProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveRewriteProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveRewriteProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeRewriteProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeRewriteProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendRewrite.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendRewrite.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendRewrite.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
