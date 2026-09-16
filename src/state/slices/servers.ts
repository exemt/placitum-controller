import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { Server } from "../../model/server.ts";
import { hydrateModel } from "../hydrate.ts";
import { createServer, deleteServer, updateServer } from "../thunks/servers.ts";

const adapter = createEntityAdapter<Server, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const serversSlice = createSlice({
  name: "servers",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.servers);
    });
    builder.addCase(createServer.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload.server);
    });
    builder.addCase(updateServer.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(deleteServer.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const serversReducer = serversSlice.reducer;

export const serverSelectors = adapter.getSelectors(
  (state: { servers: ReturnType<typeof serversSlice.reducer> }) => state.servers,
);

export function selectServersInSpace(
  state: { servers: ReturnType<typeof serversSlice.reducer> },
  spaceId: string,
): Server[] {
  return serverSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
