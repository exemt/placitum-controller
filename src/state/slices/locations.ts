import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { LocationView } from "../../locations.ts";
import { hydrateModel } from "../hydrate.ts";
import { createServer, deleteServer } from "../thunks/servers.ts";
import {
  createLocation,
  deleteLocation,
  reorderLocations,
  updateLocation,
} from "../thunks/locations.ts";

const adapter = createEntityAdapter<LocationView, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => {
    if (a.serverName !== b.serverName) {
      return a.serverName.localeCompare(b.serverName);
    }
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return a.path.localeCompare(b.path);
  },
});

const locationsSlice = createSlice({
  name: "locations",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.locations);
    });
    builder.addCase(createLocation.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(createServer.fulfilled, (state, action) => {
      adapter.upsertMany(state, action.payload.locations);
    });
    builder.addCase(updateLocation.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(reorderLocations.fulfilled, (state, action) => {
      adapter.upsertMany(state, action.payload);
    });
    builder.addCase(deleteLocation.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
    builder.addCase(deleteServer.fulfilled, (state, action) => {
      const gone = Object.values(state.entities)
        .filter((row) => row !== undefined && row.serverId === action.payload.id)
        .map((row) => row.id);
      adapter.removeMany(state, gone);
    });
  },
});

export const locationsReducer = locationsSlice.reducer;

export const locationSelectors = adapter.getSelectors(
  (state: { locations: ReturnType<typeof locationsSlice.reducer> }) =>
    state.locations,
);

export function selectLocationsInSpace(
  state: { locations: ReturnType<typeof locationsSlice.reducer> },
  spaceId: string,
): LocationView[] {
  return locationSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}

export function selectLocationsOnServer(
  state: { locations: ReturnType<typeof locationsSlice.reducer> },
  serverId: string,
): LocationView[] {
  return locationSelectors
    .selectAll(state)
    .filter((row) => row.serverId === serverId);
}
