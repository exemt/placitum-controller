import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { RuleFile, RuleFileMeta } from "../../model/rule-set.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  createRuleFile,
  deleteRuleFile,
  updateRuleFile,
} from "../thunks/rule-files.ts";

const adapter = createEntityAdapter<RuleFileMeta, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

function metaOf(row: RuleFile): RuleFileMeta {
  return {
    id: row.id,
    httpSpaceId: row.httpSpaceId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ruleFilesSlice = createSlice({
  name: "ruleFiles",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.ruleFiles);
    });
    builder.addCase(createRuleFile.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(updateRuleFile.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(deleteRuleFile.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const ruleFilesReducer = ruleFilesSlice.reducer;

export const ruleFileSelectors = adapter.getSelectors(
  (state: { ruleFiles: ReturnType<typeof ruleFilesSlice.reducer> }) =>
    state.ruleFiles,
);

export function selectRuleFilesInSpace(
  state: { ruleFiles: ReturnType<typeof ruleFilesSlice.reducer> },
  spaceId: string,
): RuleFileMeta[] {
  return ruleFileSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
