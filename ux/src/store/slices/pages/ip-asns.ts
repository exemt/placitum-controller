import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  fetchIpAsnAddresses,
  fetchIpAsns,
  type IpAsn,
  type IpAsnAddress,
} from "../../../api.ts";

interface IpAsnsState {
  rows: IpAsn[];
  addresses: IpAsnAddress[];
  addressesTotal: number;
  addressesPage: number;
  addressesPageSize: number;
  addressesLoading: boolean;
  addressesQuery: string;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: IpAsnsState = {
  rows: [],
  addresses: [],
  addressesTotal: 0,
  addressesPage: 0,
  addressesPageSize: 10,
  addressesLoading: false,
  addressesQuery: "",
  selectedId: null,
  loading: true,
  error: null,
};

export const loadIpAsns = createAsyncThunk(
  "pages/ipAsns/load",
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

export const loadIpAsnAddresses = createAsyncThunk(
  "pages/ipAsns/addresses",
  async (
    input: {
      scope: string;
      id: string;
      page: number;
      pageSize: number;
      q: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await fetchIpAsnAddresses(
        input.scope,
        input.id,
        input.page,
        input.pageSize,
        input.q,
      );
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const ipAsnsSlice = createSlice({
  name: "pages/ipAsns",
  initialState,
  reducers: {
    selectAsn(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
      state.addresses = [];
      state.addressesTotal = 0;
      state.addressesPage = 0;
      state.addressesQuery = "";
      state.addressesLoading = action.payload !== null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadIpAsns.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadIpAsns.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadIpAsns.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadIpAsnAddresses.pending, (state, action) => {
      state.addressesLoading = true;
      if (action.meta.arg.id === state.selectedId) {
        state.addressesPage = action.meta.arg.page;
        state.addressesPageSize = action.meta.arg.pageSize;
        state.addressesQuery = action.meta.arg.q;
      }
    });
    builder.addCase(loadIpAsnAddresses.fulfilled, (state, action) => {
      if (action.meta.arg.id !== state.selectedId) {
        return;
      }
      if (action.meta.arg.page !== state.addressesPage) {
        return;
      }
      if (action.meta.arg.q !== state.addressesQuery) {
        return;
      }
      state.addresses = action.payload.addresses;
      state.addressesTotal = action.payload.total;
      state.addressesPage = action.payload.page;
      state.addressesPageSize = action.payload.page_size;
      state.addressesLoading = false;
      state.error = null;
    });
    builder.addCase(loadIpAsnAddresses.rejected, (state, action) => {
      if (action.meta.arg.id !== state.selectedId) {
        return;
      }
      if (action.meta.arg.page !== state.addressesPage) {
        return;
      }
      if (action.meta.arg.q !== state.addressesQuery) {
        return;
      }
      state.addresses = [];
      state.addressesTotal = 0;
      state.addressesLoading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { selectAsn } = ipAsnsSlice.actions;
export default ipAsnsSlice.reducer;
