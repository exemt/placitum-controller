import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  createIpSet,
  deleteIpSet,
  fetchDatasets,
  fetchIpAsns,
  fetchIpCountries,
  fetchIpSet,
  fetchIpSets,
  updateIpSet,
  type Dataset,
  type IpAsn,
  type IpCountry,
  type IpSet,
  type IpSetMatchInput,
  type IpSetMeta,
} from "../../../api.ts";

interface IpSetsState {
  rows: IpSetMeta[];
  detail: IpSet | null;
  lists: Dataset[];
  countries: IpCountry[];
  asns: IpAsn[];
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: IpSetsState = {
  rows: [],
  detail: null,
  lists: [],
  countries: [],
  asns: [],
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadIpSets = createAsyncThunk(
  "pages/ipSets/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as IpSetMeta[];
    }

    try {
      return await fetchIpSets(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpSetLists = createAsyncThunk(
  "pages/ipSets/loadLists",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as Dataset[];
    }

    try {
      const rows = await fetchDatasets(scope);

      return rows.filter(
        (row) =>
          row.kind === "list" && (row.type === "ipv4" || row.type === "ip"),
      );
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpSetCountries = createAsyncThunk(
  "pages/ipSets/loadCountries",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as IpCountry[];
    }

    try {
      return await fetchIpCountries(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpSetAsns = createAsyncThunk(
  "pages/ipSets/loadAsns",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as IpAsn[];
    }

    try {
      return await fetchIpAsns(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadIpSetDetail = createAsyncThunk(
  "pages/ipSets/detail",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await fetchIpSet(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveIpSetThunk = createAsyncThunk(
  "pages/ipSets/save",
  async (
    input: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      inverse: boolean;
      match: IpSetMatchInput;
      exclude: IpSetMatchInput;
    },
    { rejectWithValue },
  ) => {
    try {
      const body = {
        name: input.name,
        description: input.description,
        inverse: input.inverse,
        lists: input.match.lists,
        countries: input.match.countries,
        asns: input.match.asns,
        exclude: input.exclude,
      };

      if (input.id === null) {
        await createIpSet(input.scope, body);
      } else {
        await updateIpSet(input.scope, input.id, body);
      }

      return await fetchIpSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const copyIpSetThunk = createAsyncThunk(
  "pages/ipSets/copy",
  async (
    input: { scope: string; id: string; name: string },
    { rejectWithValue },
  ) => {
    try {
      const source = await fetchIpSet(input.scope, input.id);
      await createIpSet(input.scope, {
        name: input.name,
        description: source.description,
        inverse: source.inverse,
        lists: source.lists.map((list) => list.uuid),
        countries: source.countries,
        asns: source.asns,
        exclude: {
          lists: source.exclude.lists.map((list) => list.uuid),
          countries: source.exclude.countries,
          asns: source.exclude.asns,
        },
      });

      return await fetchIpSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deleteIpSetThunk = createAsyncThunk(
  "pages/ipSets/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteIpSet(input.scope, input.id);

      return await fetchIpSets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const ipSetsSlice = createSlice({
  name: "pages/ipSets",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;

      if (action.payload === null) {
        state.detail = null;
      }
    },
    closePanel(state) {
      state.panelId = undefined;
      state.detail = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadIpSets.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadIpSets.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadIpSets.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadIpSetLists.fulfilled, (state, action) => {
      state.lists = action.payload;
    });
    builder.addCase(loadIpSetCountries.fulfilled, (state, action) => {
      state.countries = action.payload;
    });
    builder.addCase(loadIpSetAsns.fulfilled, (state, action) => {
      state.asns = action.payload;
    });
    builder.addCase(loadIpSetDetail.fulfilled, (state, action) => {
      state.detail = action.payload;
      state.error = null;
    });
    builder.addCase(loadIpSetDetail.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(saveIpSetThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(saveIpSetThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(deleteIpSetThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.detail = null;
      state.error = null;
    });
    builder.addCase(deleteIpSetThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = ipSetsSlice.actions;
export default ipSetsSlice.reducer;
