import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { InspectorView } from "../../fleet.ts";
import { groupInspectors, type InspectorGroup } from "../../inspectors.ts";
import { reuseList } from "../reuse.ts";

interface InspectorsState {
  rows: InspectorView[];
  seq: number;
}

const initialState: InspectorsState = {
  rows: [],
  seq: 0,
};

const inspectorsSlice = createSlice({
  name: "inspectors",
  initialState,
  reducers: {
    setInspectors(
      state,
      action: PayloadAction<{ seq: number; rows: InspectorView[] }>,
    ) {
      if (state.seq > 0 && action.payload.seq <= state.seq) {
        return;
      }
      state.seq = action.payload.seq;
      state.rows = reuseList(state.rows, action.payload.rows, (row) => row.uuid);
    },
  },
});

export const { setInspectors } = inspectorsSlice.actions;
export default inspectorsSlice.reducer;

export const selectInspectorGroups = createSelector(
  (state: { inspectors: InspectorsState }) => state.inspectors.rows,
  (rows): InspectorGroup[] => groupInspectors(rows),
);

export const selectInspectorGroupNames = createSelector(
  (state: { inspectors: InspectorsState }) => state.inspectors.rows,
  (rows): string[] => [...new Set(rows.map((row) => row.name))],
);
