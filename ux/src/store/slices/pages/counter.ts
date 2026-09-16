import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteCounterProfile,
  fetchCounterProfile,
  fetchCounterProfiles,
  fetchCounterShared,
  fetchDenyResponses,
  restoreCounterProfile,
  saveCounterProfile,
  saveCounterShared,
  sendCounterProfiles,
  type CounterProfile,
  type CounterProfileDoc,
  type CounterSharedDoc,
  type DenyResponseRow,
} from "../../../api.ts";

interface CounterState {
  rows: CounterProfile[];
  shared: CounterSharedDoc | null;
  detail: CounterProfile | null;
  denyResponses: DenyResponseRow[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: CounterState = {
  rows: [],
  shared: null,
  detail: null,
  denyResponses: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadCounterProfiles = createAsyncThunk(
  "pages/counter/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as CounterProfile[];
    }

    try {
      return await fetchCounterProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCounterShared = createAsyncThunk(
  "pages/counter/loadShared",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return null;
    }

    try {
      return await fetchCounterShared(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveCounterSharedThunk = createAsyncThunk(
  "pages/counter/saveShared",
  async (
    args: { scope: string; shared: CounterSharedDoc },
    { rejectWithValue },
  ) => {
    try {
      return await saveCounterShared(args.scope, args.shared);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCounterDenyResponses = createAsyncThunk(
  "pages/counter/loadDenyResponses",
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

export const loadCounterProfileDetail = createAsyncThunk(
  "pages/counter/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchCounterProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveCounterProfileThunk = createAsyncThunk(
  "pages/counter/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: CounterProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveCounterProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadCounterProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyCounterProfile = createAsyncThunk(
  "pages/counter/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchCounterProfile(scope, id);
      await saveCounterProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadCounterProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const restoreCounterProfileThunk = createAsyncThunk(
  "pages/counter/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreCounterProfile(scope, id);
      void dispatch(loadCounterProfiles(scope));

      return await dispatch(loadCounterProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeCounterProfile = createAsyncThunk(
  "pages/counter/remove",
  async (
    { scope, id }: { scope: string; id: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await deleteCounterProfile(scope, id);
      void dispatch(loadCounterProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendCounter = createAsyncThunk(
  "pages/counter/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendCounterProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/counter",
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
      .addCase(loadCounterProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadCounterProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadCounterProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadCounterShared.fulfilled, (state, action) => {
        state.shared = action.payload;
      })
      .addCase(saveCounterSharedThunk.fulfilled, (state, action) => {
        state.shared = action.payload;
        state.error = null;
      })
      .addCase(saveCounterSharedThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadCounterDenyResponses.fulfilled, (state, action) => {
        state.denyResponses = action.payload;
      })
      .addCase(loadCounterProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveCounterProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveCounterProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCounterProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCounterProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendCounter.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendCounter.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendCounter.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
