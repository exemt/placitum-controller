import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { IpCountry } from "../../model/ip-profile.ts";
import { hydrateModel } from "../hydrate.ts";

const adapter = createEntityAdapter<IpCountry, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.code.localeCompare(b.code) || a.type.localeCompare(b.type),
});

const ipCountriesSlice = createSlice({
  name: "ipCountries",
  initialState: adapter.getInitialState(),
  reducers: {
    ipCountriesReplaced(
      state,
      action: PayloadAction<{ spaceId: string; rows: IpCountry[] }>,
    ) {
      const stale = state.ids.filter(
        (id) => state.entities[id]?.httpSpaceId === action.payload.spaceId,
      );
      adapter.removeMany(state, stale);
      adapter.upsertMany(state, action.payload.rows);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.ipCountries);
    });
  },
});

export const ipCountriesReducer = ipCountriesSlice.reducer;
export const { ipCountriesReplaced } = ipCountriesSlice.actions;

export const ipCountrySelectors = adapter.getSelectors(
  (state: { ipCountries: ReturnType<typeof ipCountriesSlice.reducer> }) =>
    state.ipCountries,
);

export function selectIpCountriesInSpace(
  state: { ipCountries: ReturnType<typeof ipCountriesSlice.reducer> },
  spaceId: string,
): IpCountry[] {
  return ipCountrySelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
