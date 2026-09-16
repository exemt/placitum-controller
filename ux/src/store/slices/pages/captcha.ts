import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createStoreObject,
  fetchCrypto,
  deleteCaptchaProfile,
  fetchCaptchaProfile,
  fetchCaptchaProfiles,
  fetchDatasets,
  fetchDenyResponses,
  fetchLocations,
  fetchServers,
  restoreCaptchaProfile,
  saveCaptchaProfile,
  sendCaptchaProfiles,
  type CaptchaProfile,
  type CaptchaProfileDoc,
  type Dataset,
  type DenyResponseRow,
  type RouteLocation,
  type RouteServer,
} from "../../../api.ts";
import { checkFingerprint, importContourPublicKey, sealPemToBase64 } from "../../../crypto/seal.ts";

interface CaptchaState {
  rows: CaptchaProfile[];
  detail: CaptchaProfile | null;
  servers: RouteServer[];
  locations: RouteLocation[];
  datasets: Dataset[];
  pages: Dataset[];
  denyResponses: DenyResponseRow[];
  panelId: string | null | undefined;
  loading: boolean;
  sending: boolean;
  sent: string | null;
  error: string | null;
}

const initialState: CaptchaState = {
  rows: [],
  detail: null,
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

export const loadCaptchaProfiles = createAsyncThunk(
  "pages/captcha/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as CaptchaProfile[];
    }

    try {
      return await fetchCaptchaProfiles(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCaptchaServers = createAsyncThunk(
  "pages/captcha/loadServers",
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

export const loadCaptchaDatasets = createAsyncThunk(
  "pages/captcha/loadDatasets",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return { lists: [] as Dataset[], pages: [] as Dataset[] };
    }

    try {
      const rows = await fetchDatasets(scope);

      return {
        lists: rows.filter(
          (row) => row.kind === "list" && row.type === "string" && row.active,
        ),
        pages: rows.filter((row) => row.kind === "content"),
      };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCaptchaLocations = createAsyncThunk(
  "pages/captcha/loadLocations",
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

export const loadCaptchaDenyResponses = createAsyncThunk(
  "pages/captcha/loadDenyResponses",
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

export const loadCaptchaProfileDetail = createAsyncThunk(
  "pages/captcha/detail",
  async ({ scope, id }: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchCaptchaProfile(scope, id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveCaptchaProfileThunk = createAsyncThunk(
  "pages/captcha/save",
  async (
    args: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      serverId: string | null;
      doc: CaptchaProfileDoc;
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const row = await saveCaptchaProfile(args.scope, args.id, {
        name: args.name,
        description: args.description,
        server_id: args.serverId,
        doc: args.doc,
      });

      void dispatch(loadCaptchaProfiles(args.scope));

      return row;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyCaptchaProfile = createAsyncThunk(
  "pages/captcha/copy",
  async (
    { scope, id, name }: { scope: string; id: string; name: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const source = await fetchCaptchaProfile(scope, id);
      await saveCaptchaProfile(scope, null, {
        name,
        description: source.description,
        server_id: source.server_id,
        doc: source.doc,
      });
      void dispatch(loadCaptchaProfiles(scope));

      return name;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const restoreCaptchaProfileThunk = createAsyncThunk(
  "pages/captcha/restore",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await restoreCaptchaProfile(scope, id);
      void dispatch(loadCaptchaProfiles(scope));

      return await dispatch(loadCaptchaProfileDetail({ scope, id })).unwrap();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeCaptchaProfile = createAsyncThunk(
  "pages/captcha/remove",
  async ({ scope, id }: { scope: string; id: string }, { dispatch, rejectWithValue }) => {
    try {
      await deleteCaptchaProfile(scope, id);
      void dispatch(loadCaptchaProfiles(scope));

      return id;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sealCaptchaSecret = createAsyncThunk(
  "pages/captcha/sealSecret",
  async (
    { scope, provider, secret }: { scope: string; provider: string; secret: string },
    { rejectWithValue },
  ) => {
    try {
      const crypto = await fetchCrypto(scope);

      if (checkFingerprint(crypto.fingerprint) === "mismatch") {
        return rejectWithValue("fingerprint_mismatch");
      }

      const publicKey = await importContourPublicKey(crypto.public_key);
      const object = await createStoreObject(scope, {
        type: "creds",
        blob: await sealPemToBase64(secret, publicKey),
        metadata: { kind: "captcha_secret", provider },
      });

      return object.uuid;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendCaptcha = createAsyncThunk(
  "pages/captcha/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      const manifest = await sendCaptchaProfiles(scope);

      return manifest.config_hash;
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const slice = createSlice({
  name: "pages/captcha",
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
      .addCase(loadCaptchaProfiles.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadCaptchaProfiles.fulfilled, (state, action) => {
        state.rows = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadCaptchaProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(loadCaptchaServers.fulfilled, (state, action) => {
        state.servers = action.payload;
      })
      .addCase(loadCaptchaDatasets.fulfilled, (state, action) => {
        state.datasets = action.payload.lists;
        state.pages = action.payload.pages;
      })
      .addCase(loadCaptchaDenyResponses.fulfilled, (state, action) => {
        state.denyResponses = action.payload;
      })
      .addCase(loadCaptchaLocations.fulfilled, (state, action) => {
        state.locations = action.payload;
      })
      .addCase(loadCaptchaProfileDetail.fulfilled, (state, action) => {
        state.detail = action.payload;
      })
      .addCase(saveCaptchaProfileThunk.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
        state.error = null;
      })
      .addCase(saveCaptchaProfileThunk.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCaptchaProfile.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(removeCaptchaProfile.fulfilled, (state) => {
        state.panelId = undefined;
        state.detail = null;
      })
      .addCase(sendCaptcha.pending, (state) => {
        state.sending = true;
        state.sent = null;
      })
      .addCase(sendCaptcha.fulfilled, (state, action) => {
        state.sending = false;
        state.sent = action.payload;
        state.error = null;
      })
      .addCase(sendCaptcha.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload ?? action.error.message);
      })
      .addCase(sealCaptchaSecret.rejected, (state, action) => {
        state.error = String(action.payload ?? action.error.message);
      });
  },
});

export const { openPanel, closePanel, clearSent } = slice.actions;

export default slice.reducer;
