import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createLocation,
  deleteLocation,
  fetchLocations,
  fetchServers,
  fetchUpstreams,
  reorderLocations,
  updateLocation,
  type LocationInput,
  type RouteLocation,
  type RouteServer,
  type UpstreamPool,
} from "../../../api.ts";

interface PathsState {
  servers: RouteServer[];
  upstreams: UpstreamPool[];
  rows: RouteLocation[];
  serverId: string | null;
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: PathsState = {
  servers: [],
  upstreams: [],
  rows: [],
  serverId: null,
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadPaths = createAsyncThunk(
  "pages/paths/load",
  async (
    input: { scope: string | null; serverId?: string | null },
    { rejectWithValue },
  ) => {
    if (input.scope === null) {
      return {
        servers: [] as RouteServer[],
        upstreams: [] as UpstreamPool[],
        rows: [] as RouteLocation[],
      };
    }
    try {
      const [servers, upstreams, rows] = await Promise.all([
        fetchServers(input.scope),
        fetchUpstreams(input.scope),
        fetchLocations(input.scope, input.serverId ?? undefined),
      ]);
      return { servers, upstreams, rows };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveLocationThunk = createAsyncThunk(
  "pages/paths/save",
  async (
    input: {
      scope: string;
      serverId: string;
      id: string | null;
      body: LocationInput;
    },
    { rejectWithValue },
  ) => {
    try {
      return input.id === null
        ? await createLocation(input.scope, input.serverId, input.body)
        : await updateLocation(input.scope, input.id, input.body);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyLocationThunk = createAsyncThunk(
  "pages/paths/copy",
  async (
    input: { scope: string; source: RouteLocation; path: string },
    { rejectWithValue },
  ) => {
    const source = input.source;
    try {
      return await createLocation(input.scope, source.server_id, {
        match: source.match,
        path: input.path,
        enabled: source.enabled,
        handler: source.handler,
        protocol: source.protocol,
        upstream_id: source.upstream_id,
        upstream_uri: source.upstream_uri,
        return_status: source.return_status,
        return_page: source.return_page,
        return_url: source.return_url,
        static_file: source.static_file,
        nginx: source.nginx,
        waf: source.waf,
        raw: source.raw,
        raw_nginx: source.raw_nginx,
      });
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deleteLocationThunk = createAsyncThunk(
  "pages/paths/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await deleteLocation(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const reorderLocationsThunk = createAsyncThunk(
  "pages/paths/reorder",
  async (
    input: { scope: string; serverId: string; order: string[] },
    { rejectWithValue },
  ) => {
    try {
      return await reorderLocations(input.scope, input.serverId, input.order);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const pathsPageSlice = createSlice({
  name: "pages/paths",
  initialState,
  reducers: {
    setServerFilter(state, action: PayloadAction<string | null>) {
      state.serverId = action.payload;
    },
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
    },
    closePanel(state) {
      state.panelId = undefined;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadPaths.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadPaths.fulfilled, (state, action) => {
      state.servers = action.payload.servers;
      state.upstreams = action.payload.upstreams;
      state.rows = action.payload.rows;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadPaths.rejected, (state, action) => {
      state.servers = [];
      state.upstreams = [];
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveLocationThunk.fulfilled, (state, action) => {
      const next = action.payload;
      const index = state.rows.findIndex((row) => row.uuid === next.uuid);
      if (index === -1) {
        state.rows = [...state.rows, next];
      } else {
        state.rows[index] = next;
      }
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(saveLocationThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(reorderLocationsThunk.fulfilled, (state, action) => {
      const serverId = action.meta.arg.serverId;
      state.rows = [
        ...state.rows.filter((row) => row.server_id !== serverId),
        ...action.payload,
      ].sort(
        (a, b) =>
          a.server_name.localeCompare(b.server_name) ||
          a.position - b.position ||
          a.path.localeCompare(b.path),
      );
      state.error = null;
    });
    builder.addCase(reorderLocationsThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(copyLocationThunk.fulfilled, (state, action) => {
      state.rows = [...state.rows, action.payload];
      state.error = null;
    });
    builder.addCase(deleteLocationThunk.fulfilled, (state, action) => {
      state.rows = state.rows.filter((row) => row.uuid !== action.payload.uuid);
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(deleteLocationThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { setServerFilter, openPanel, closePanel } = pathsPageSlice.actions;
export default pathsPageSlice.reducer;
