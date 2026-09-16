import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import { fetchHealth, fetchSpaces, type Space } from "../../api.ts";
import type { Connection } from "../../connection.ts";

const SCOPE_KEY = "waf.scope";

function readWantedScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}

function persistScope(id: string | null): void {
  if (id === null) {
    return;
  }
  localStorage.setItem(SCOPE_KEY, id);
}

function pickScope(spaces: Space[], wanted: string | null): string | null {
  if (spaces.length === 0) {
    return null;
  }
  if (wanted !== null && spaces.some((row) => row.uuid === wanted)) {
    return wanted;
  }
  const named = spaces.find((row) => row.name === "default");
  return named?.uuid ?? spaces[0].uuid;
}

interface SessionState {
  connection: Connection;
  spaces: Space[];
  scope: string | null;
  error: string | null;
}

const initialState: SessionState = {
  connection: "checking",
  spaces: [],
  scope: null,
  error: null,
};

export const loadSpaces = createAsyncThunk(
  "session/loadSpaces",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchSpaces();
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const pingHealth = createAsyncThunk("session/pingHealth", async () => {
  try {
    const health = await fetchHealth();
    return health.ok ? ("online" as const) : ("offline" as const);
  } catch {
    return "offline" as const;
  }
});

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setScope(state, action: PayloadAction<string>) {
      state.scope = action.payload;
      persistScope(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadSpaces.fulfilled, (state, action) => {
      state.spaces = action.payload;
      state.error = null;
      const next = pickScope(action.payload, readWantedScope() ?? state.scope);
      state.scope = next;
      persistScope(next);
    });
    builder.addCase(loadSpaces.rejected, (state, action) => {
      state.spaces = [];
      state.scope = null;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(pingHealth.fulfilled, (state, action) => {
      state.connection = action.payload;
    });
  },
});

export const { setScope } = sessionSlice.actions;
export default sessionSlice.reducer;
