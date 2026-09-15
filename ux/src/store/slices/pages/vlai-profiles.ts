import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  deleteVlaiProfile,
  fetchInspectors,
  fetchVlaiProfile,
  fetchVlaiProfiles,
  restoreVlaiProfile,
  saveVlaiProfile,
  sendVlaiProfiles,
  type InspectorMeta,
  type VlaiProfile,
  type VlaiProfileDoc,
} from "../../../api.ts";

interface VlaiProfilesState {
  rows: VlaiProfile[];
  detail: VlaiProfile | null;
  inspectors: InspectorMeta[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: VlaiProfilesState = {
  rows: [],
  detail: null,
  inspectors: [],
  panelId: undefined,
  loading: true,
  sending: false,
  sent: null,
  error: null,
};

export const loadVlaiProfiles = createAsyncThunk(
  "pages/vlaiProfiles/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as VlaiProfile[];
    }

    try {
      return await fetchVlaiProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadVlaiInspectors = createAsyncThunk(
  "pages/vlaiProfiles/loadInspectors",
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

export const loadVlaiProfileDetail = createAsyncThunk(
  "pages/vlaiProfiles/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchVlaiProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveVlaiProfileThunk = createAsyncThunk(
  "pages/vlaiProfiles/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      doc: VlaiProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveVlaiProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        doc: args.doc,
      });

      void dispatch(loadVlaiProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyVlaiProfile = createAsyncThunk(
  "pages/vlaiProfiles/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchVlaiProfile(scope, id);
      await saveVlaiProfile(scope, null, {
        name,
        description: source.description,
        doc: source.doc,
      });
      void dispatch(loadVlaiProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const restoreVlaiProfileThunk = createAsyncThunk(
  "pages/vlaiProfiles/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreVlaiProfile(scope, id);
      void dispatch(loadVlaiProfiles(scope));

      return await dispatch(loadVlaiProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeVlaiProfile = createAsyncThunk(
  "pages/vlaiProfiles/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteVlaiProfile(scope, id);
      void dispatch(loadVlaiProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendVlai = createAsyncThunk(
  "pages/vlaiProfiles/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendVlaiProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/vlaiProfiles",
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
      .addCase(loadVlaiProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadVlaiProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadVlaiProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadVlaiInspectors.fulfilled, (state, action) => {
        state.inspectors = action.payload;
      })
      .addCase(loadVlaiProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveVlaiProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveVlaiProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeVlaiProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeVlaiProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendVlai.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendVlai.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendVlai.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
