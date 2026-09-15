import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  fetchSpaceHttp,
  saveSpaceHttp,
  sendNginxConfig,
  type NginxConfigSendResult,
  type SpaceHttp,
} from "../../../api.ts";

interface ConfigState {
  doc: SpaceHttp | null;
  loading: boolean;
  saving: boolean;
  sending: boolean;
  lastSend: NginxConfigSendResult | null;
  error: string | null;
}

const initialState: ConfigState = {
  doc: null,
  loading: false,
  saving: false,
  sending: false,
  lastSend: null,
  error: null,
};

export const loadSpaceHttp = createAsyncThunk(
  "pages/config/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return null;
    }
    try {
      return await fetchSpaceHttp(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveSpaceHttpThunk = createAsyncThunk(
  "pages/config/save",
  async (
    input: {
      scope: string;
      nginx_main: Record<string, unknown>;
      nginx: Record<string, unknown>;
      waf_http: Record<string, unknown>;
      waf: Record<string, unknown>;
      raw: boolean;
      raw_nginx: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await saveSpaceHttp(input.scope, {
        nginx_main: input.nginx_main,
        nginx: input.nginx,
        waf_http: input.waf_http,
        waf: input.waf,
        raw: input.raw,
        raw_nginx: input.raw_nginx,
      });
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const sendConfigThunk = createAsyncThunk(
  "pages/config/send",
  async (scope: string, { rejectWithValue }) => {
    try {
      return await sendNginxConfig(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const configSlice = createSlice({
  name: "pages/config",
  initialState,
  reducers: {
    clearConfigError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadSpaceHttp.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadSpaceHttp.fulfilled, (state, action) => {
      state.doc = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadSpaceHttp.rejected, (state, action) => {
      state.doc = null;
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveSpaceHttpThunk.pending, (state) => {
      state.saving = true;
    });
    builder.addCase(saveSpaceHttpThunk.fulfilled, (state, action) => {
      state.doc = action.payload;
      state.saving = false;
      state.error = null;
    });
    builder.addCase(saveSpaceHttpThunk.rejected, (state, action) => {
      state.saving = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(sendConfigThunk.pending, (state) => {
      state.sending = true;
    });
    builder.addCase(sendConfigThunk.fulfilled, (state, action) => {
      state.sending = false;
      state.lastSend = action.payload;
      state.error = null;
    });
    builder.addCase(sendConfigThunk.rejected, (state, action) => {
      state.sending = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { clearConfigError } = configSlice.actions;
export default configSlice.reducer;
