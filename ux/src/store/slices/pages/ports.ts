import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createPort,
  deletePort,
  fetchPorts,
  updatePort,
  type ListenPort,
  type PortInput,
} from "../../../api.ts";

interface PortsState {
  rows: ListenPort[];
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: PortsState = {
  rows: [],
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadPorts = createAsyncThunk(
  "pages/ports/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as ListenPort[];
    }
    try {
      return await fetchPorts(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const savePortThunk = createAsyncThunk(
  "pages/ports/save",
  async (
    input: { scope: string; id: string | null; body: PortInput },
    { rejectWithValue },
  ) => {
    try {
      return input.id === null
        ? await createPort(input.scope, input.body)
        : await updatePort(input.scope, input.id, input.body);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deletePortThunk = createAsyncThunk(
  "pages/ports/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await deletePort(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const portsPageSlice = createSlice({
  name: "pages/ports",
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
    builder.addCase(loadPorts.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadPorts.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadPorts.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(savePortThunk.fulfilled, (state, action) => {
      const next = action.payload;
      const index = state.rows.findIndex((row) => row.uuid === next.uuid);
      if (index === -1) {
        state.rows = [...state.rows, next].sort((a, b) => a.port - b.port);
      } else {
        state.rows[index] = next;
      }
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(savePortThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(deletePortThunk.fulfilled, (state, action) => {
      state.rows = state.rows.filter((row) => row.uuid !== action.payload.uuid);
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(deletePortThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = portsPageSlice.actions;
export default portsPageSlice.reducer;
