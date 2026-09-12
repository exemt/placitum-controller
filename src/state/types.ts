import type {
  ThunkDispatch,
  TypedStartListening,
  UnknownAction,
} from "@reduxjs/toolkit";

import type { ThunkExtra } from "./extra.ts";
import type { RootState } from "./root.ts";

export type { RootState };

export type AppDispatch = ThunkDispatch<RootState, ThunkExtra, UnknownAction>;

export type AppStartListening = TypedStartListening<
  RootState,
  AppDispatch,
  ThunkExtra
>;
