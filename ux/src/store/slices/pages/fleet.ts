import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface FleetPageState {
  entered: boolean;
  expanded: string[];
}

const initialState: FleetPageState = {
  entered: false,
  expanded: [],
};

const fleetPageSlice = createSlice({
  name: "pages/fleet",
  initialState,
  reducers: {
    enter(state) {
      state.entered = true;
    },
    leave(state) {
      state.entered = false;
      state.expanded = [];
    },
    toggleExpanded(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.expanded.includes(id)) {
        state.expanded = state.expanded.filter((row) => row !== id);
      } else {
        state.expanded = [...state.expanded, id];
      }
    },
  },
});

export const { enter, leave, toggleExpanded } = fleetPageSlice.actions;
export default fleetPageSlice.reducer;
