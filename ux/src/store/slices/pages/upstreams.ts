import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createUpstream,
  deleteUpstream,
  fetchUpstreams,
  updateUpstream,
  type UpstreamInput,
  type UpstreamPool,
} from "../../../api.ts";

interface UpstreamsState {
  rows: UpstreamPool[];
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: UpstreamsState = {
  rows: [],
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadUpstreams = createAsyncThunk(
  "pages/upstreams/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as UpstreamPool[];
    }
    try {
      return await fetchUpstreams(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveUpstreamThunk = createAsyncThunk(
  "pages/upstreams/save",
  async (
    input: { scope: string; id: string | null; body: UpstreamInput },
    { rejectWithValue },
  ) => {
    try {
      return input.id === null
        ? await createUpstream(input.scope, input.body)
        : await updateUpstream(input.scope, input.id, input.body);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Копия пула под новым именем.
 *
 * Список отдаёт пул целиком вместе с узлами, поэтому образец берётся из
 * строки: второй запрос за тем, что уже лежит в сторе, ничего бы не уточнил.
 */
export const copyUpstreamThunk = createAsyncThunk(
  "pages/upstreams/copy",
  async (
    input: { scope: string; source: UpstreamPool; name: string },
    { rejectWithValue },
  ) => {
    const source = input.source;
    try {
      await createUpstream(input.scope, {
        name: input.name,
        method: source.method,
        hash_key: source.hash_key,
        keepalive: source.keepalive,
        keepalive_requests: source.keepalive_requests,
        keepalive_timeout_ms: source.keepalive_timeout_ms,
        tls: source.tls,
        tls_name: source.tls_name,
        host_header: source.host_header,
        peers: source.peers.map((peer) => ({
          host: peer.host,
          port: peer.port,
          weight: peer.weight,
          max_fails: peer.max_fails,
          fail_timeout_ms: peer.fail_timeout_ms,
          backup: peer.backup,
          down: peer.down,
          resolve: peer.resolve,
        })),
      });
      return await fetchUpstreams(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deleteUpstreamThunk = createAsyncThunk(
  "pages/upstreams/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await deleteUpstream(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const upstreamsPageSlice = createSlice({
  name: "pages/upstreams",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
    },
    closePanel(state) {
      state.panelId = undefined;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUpstreams.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadUpstreams.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadUpstreams.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveUpstreamThunk.fulfilled, (state, action) => {
      const next = action.payload;
      const index = state.rows.findIndex((row) => row.uuid === next.uuid);
      if (index === -1) {
        state.rows = [...state.rows, next].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      } else {
        state.rows[index] = next;
      }
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(saveUpstreamThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(copyUpstreamThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.error = null;
    });
    builder.addCase(deleteUpstreamThunk.fulfilled, (state, action) => {
      state.rows = state.rows.filter((row) => row.uuid !== action.payload.uuid);
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(deleteUpstreamThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = upstreamsPageSlice.actions;
export default upstreamsPageSlice.reducer;
