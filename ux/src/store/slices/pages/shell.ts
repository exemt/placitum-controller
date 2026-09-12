import { createSlice } from "@reduxjs/toolkit";

function emptyPage(name: string) {
  return createSlice({
    name: `pages/${name}`,
    initialState: { entered: false },
    reducers: {
      enter(state) {
        state.entered = true;
      },
      leave(state) {
        state.entered = false;
      },
    },
  });
}

const trafficSlice = emptyPage("traffic");

export const trafficEnter = trafficSlice.actions.enter;
export const trafficLeave = trafficSlice.actions.leave;

export const trafficReducer = trafficSlice.reducer;
