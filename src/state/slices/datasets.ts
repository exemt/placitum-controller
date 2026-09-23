import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { Dataset } from "../../model/http-space.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  addAddresses,
  createDataset,
  deleteDataset,
  putContent,
  removeAddress,
  replaceAddresses,
  setSource,
  updateDataset,
} from "../thunks/datasets.ts";

const adapter = createEntityAdapter<Dataset, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const datasetsSlice = createSlice({
  name: "datasets",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.datasets);
    });
    builder.addCase(createDataset.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(updateDataset.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
    builder.addCase(deleteDataset.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
    builder.addCase(addAddresses.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload.dataset);
    });
    builder.addCase(removeAddress.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload.dataset);
    });
    builder.addCase(putContent.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload.dataset);
    });
    builder.addCase(replaceAddresses.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload.dataset);
    });
    builder.addCase(setSource.fulfilled, (state, action) => {
      adapter.upsertOne(state, action.payload);
    });
  },
});

export const datasetsReducer = datasetsSlice.reducer;

export const datasetSelectors = adapter.getSelectors(
  (state: { datasets: ReturnType<typeof datasetsSlice.reducer> }) =>
    state.datasets,
);

export function selectDatasetsInSpace(
  state: { datasets: ReturnType<typeof datasetsSlice.reducer> },
  spaceId: string,
): Dataset[] {
  return datasetSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
