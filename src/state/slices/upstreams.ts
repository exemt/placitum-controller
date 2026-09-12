import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { UpstreamTree } from "../../model/upstream.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  createUpstream,
  deleteUpstream,
  updateUpstream,
} from "../thunks/upstreams.ts";

const adapter = createEntityAdapter<UpstreamTree, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const upstreamsSlice = createSlice({
  name: "upstreams",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.upstreams);
    });
    builder.addCase(createUpstream.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(updateUpstream.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(deleteUpstream.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const upstreamsReducer = upstreamsSlice.reducer;

export const upstreamSelectors = adapter.getSelectors(
  (state: { upstreams: ReturnType<typeof upstreamsSlice.reducer> }) =>
    state.upstreams,
);

export function selectUpstreamsInSpace(
  state: { upstreams: ReturnType<typeof upstreamsSlice.reducer> },
  spaceId: string,
): UpstreamTree[] {
  return upstreamSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
