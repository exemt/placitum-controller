import { configureStore } from '@reduxjs/toolkit';
import type { Action, ThunkAction } from '@reduxjs/toolkit';
import { filesReducer } from './filesSlice';

export function makeStore() {
  return configureStore({
    reducer: {
      files: filesReducer,
    },
  });
}

export type EditorStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<EditorStore['getState']>;
export type AppDispatch = EditorStore['dispatch'];

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action
>;
