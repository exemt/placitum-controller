import { configureStore } from '@reduxjs/toolkit';
import type { Action, ThunkAction } from '@reduxjs/toolkit';
import { filesReducer } from './filesSlice';

/**
 * Стор редактора: один на открытое окно.
 *
 * В самостоятельном приложении стор был один на вкладку и жил, пока жила
 * вкладка. В панели редактор открывают окном -- и не раз: закрыли набор,
 * открыли профиль. Набор прошлого окна в новом не нужен, а история отмены
 * тем более, поэтому стор заводится вместе с окном и умирает с ним.
 *
 * От стора панели он отделён контекстом (`store/hooks.ts`): хуки редактора
 * читают свой стор, хуки панели -- свой, и вложенный `Provider` ничего не
 * перекрывает.
 */
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

/** Тип для thunk-экшенов приложения (см. `applyRuleSource`). */
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action
>;
