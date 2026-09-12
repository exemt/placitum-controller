import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

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
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.ipCountries);
    });
  },
});

export const ipCountriesReducer = ipCountriesSlice.reducer;

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
