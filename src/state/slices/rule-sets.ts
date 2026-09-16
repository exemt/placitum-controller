import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { RuleSet, RuleSetMeta } from "../../model/rule-set.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  createRuleSet,
  deleteRuleSet,
  updateRuleSet,
} from "../thunks/rule-sets.ts";

const adapter = createEntityAdapter<RuleSetMeta, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

function metaOf(row: RuleSet): RuleSetMeta {
  return {
    id: row.id,
    httpSpaceId: row.httpSpaceId,
    name: row.name,
    description: row.description,
    files: row.files.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ruleSetsSlice = createSlice({
  name: "ruleSets",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.ruleSets);
    });
    builder.addCase(createRuleSet.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(updateRuleSet.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(deleteRuleSet.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const ruleSetsReducer = ruleSetsSlice.reducer;

export const ruleSetSelectors = adapter.getSelectors(
  (state: { ruleSets: ReturnType<typeof ruleSetsSlice.reducer> }) =>
    state.ruleSets,
);

export function selectRuleSetsInSpace(
  state: { ruleSets: ReturnType<typeof ruleSetsSlice.reducer> },
  spaceId: string,
): RuleSetMeta[] {
  return ruleSetSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
