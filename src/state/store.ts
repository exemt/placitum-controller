import {
  configureStore,
  createListenerMiddleware,
} from "@reduxjs/toolkit";

import type { ThunkExtra } from "./extra.ts";
import { attachListeners } from "./listeners.ts";
import { rootReducer } from "./root.ts";
import type { AppDispatch, RootState } from "./types.ts";

export type { AppDispatch, RootState } from "./types.ts";

export function createControllerStore(extra: ThunkExtra) {
  const listener = createListenerMiddleware<RootState, AppDispatch, ThunkExtra>({
    extra,
  });
  attachListeners(listener.startListening);

  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({
        serializableCheck: false,
        thunk: { extraArgument: extra },
      }).prepend(listener.middleware),
  });
}

export type ControllerStore = ReturnType<typeof createControllerStore>;
