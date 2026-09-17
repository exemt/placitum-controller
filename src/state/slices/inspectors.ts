import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { Inspector, InspectorMeta } from "../../model/http-space.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  createInspector,
  deleteInspector,
  setInstalledInspectors,
  updateInspector,
} from "../thunks/inspectors.ts";

const adapter = createEntityAdapter<InspectorMeta, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => {
    const byPos = (a.position ?? 0) - (b.position ?? 0);
    return byPos !== 0 ? byPos : a.name.localeCompare(b.name);
  },
});

function metaOf(row: Inspector): InspectorMeta {
  return {
    id: row.id,
    httpSpaceId: row.httpSpaceId,
    name: row.name,
    subject: row.subject,
    phases: row.phases,
    description: row.description,
    docsUrl: row.docsUrl,
    logLevel: row.logLevel,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const inspectorsSlice = createSlice({
  name: "inspectors",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.inspectors);
    });
    builder.addCase(createInspector.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(updateInspector.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(setInstalledInspectors.fulfilled, (state, action) => {
      const space = action.meta.arg.httpSpaceId;
      const stale = Object.values(state.entities)
        .filter((row) => row !== undefined && row.httpSpaceId === space)
        .map((row) => row!.id);

      adapter.removeMany(state, stale);
      adapter.upsertMany(state, action.payload);
    });
    builder.addCase(deleteInspector.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const inspectorsReducer = inspectorsSlice.reducer;

export const inspectorCatalogSelectors = adapter.getSelectors(
  (state: { inspectors: ReturnType<typeof inspectorsSlice.reducer> }) =>
    state.inspectors,
);

export function selectInspectorsInSpace(
  state: { inspectors: ReturnType<typeof inspectorsSlice.reducer> },
  spaceId: string,
): InspectorMeta[] {
  return inspectorCatalogSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
