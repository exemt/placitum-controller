import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface InspectorsPageState {
  entered: boolean;
  expanded: string[];
  primed: boolean;
}

const initialState: InspectorsPageState = {
  entered: false,
  expanded: [],
  primed: false,
};

const inspectorsPageSlice = createSlice({
  name: "pages/inspectors",
  initialState,
  reducers: {
    enter(state) {
      state.entered = true;
    },
    leave(state) {
      state.entered = false;
      state.primed = false;
    },
    toggleExpanded(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.expanded.includes(id)) {
        state.expanded = state.expanded.filter((row) => row !== id);
      } else {
        state.expanded = [...state.expanded, id];
      }
    },
    primeExpanded(state, action: PayloadAction<string[]>) {
      if (state.primed) {
        return;
      }
      state.expanded = action.payload;
      state.primed = true;
    },
  },
});

export const { enter, leave, toggleExpanded, primeExpanded } =
  inspectorsPageSlice.actions;
export default inspectorsPageSlice.reducer;
