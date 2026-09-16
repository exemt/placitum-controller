import { createContext } from 'react';
import {
  createDispatchHook,
  createSelectorHook,
  type ReactReduxContextValue,
} from 'react-redux';
import type { RootState, AppDispatch } from './index';

export const EditorStoreContext = createContext<ReactReduxContextValue | null>(
  null,
);

export const useAppDispatch =
  createDispatchHook(EditorStoreContext).withTypes<AppDispatch>();
export const useAppSelector =
  createSelectorHook(EditorStoreContext).withTypes<RootState>();
