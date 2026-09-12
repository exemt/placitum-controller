import { createContext } from 'react';
import {
  createDispatchHook,
  createSelectorHook,
  type ReactReduxContextValue,
} from 'react-redux';
import type { RootState, AppDispatch } from './index';

/**
 * Свой контекст react-redux.
 *
 * Редактор живёт внутри панели, у которой собственный стор и собственный
 * `Provider`. Второй `Provider` с тем же контекстом перекрыл бы стор панели
 * для всего, что рисуется под ним, -- а под ним стоят и окна панели, и её
 * подсказки. Свой контекст даёт два стора рядом: хуки редактора читают этот,
 * хуки панели -- свой, и кто где смонтирован, значения не имеет.
 */
export const EditorStoreContext = createContext<ReactReduxContextValue | null>(
  null,
);

export const useAppDispatch =
  createDispatchHook(EditorStoreContext).withTypes<AppDispatch>();
export const useAppSelector =
  createSelectorHook(EditorStoreContext).withTypes<RootState>();
