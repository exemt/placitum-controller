import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { HttpSpace } from "../../model/http-space.ts";
import { hydrateModel } from "../hydrate.ts";
import { updateSpace } from "../thunks/spaces.ts";

const adapter = createEntityAdapter<HttpSpace, string>({
  selectId: (space) => space.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const spacesSlice = createSlice({
  name: "spaces",
  initialState: adapter.getInitialState(),
  reducers: {
    upserted: adapter.upsertOne,
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.spaces);
    });
    builder.addCase(updateSpace.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
  },
});

export const spacesReducer = spacesSlice.reducer;
export const spaceUpserted = spacesSlice.actions.upserted;

export const spaceSelectors = adapter.getSelectors(
  (state: { spaces: ReturnType<typeof spacesSlice.reducer> }) => state.spaces,
);
