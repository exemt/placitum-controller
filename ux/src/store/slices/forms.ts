import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { errorCode, errorText } from "../../errors.ts";

/**
 * Состояние окон: открыто, чем открыто, занято ли и что в нём пошло не так.
 *
 * Открытость модалки -- не деталь верстки страницы, а состояние приложения:
 * окно открывают из строки таблицы, из шапки раздела и из другого окна, а
 * закрывает его успешный thunk, который про место открытия ничего не знает.
 * Пока это жило в `useState` страницы, каждое такое место заводило свой флаг,
 * и «закрыть после сохранения» приходилось прокидывать колбэком через три
 * уровня.
 *
 * `busy` и `notice` здесь по той же причине: их ставит тот же thunk, что и
 * закрывает окно. Валидации полей тут нет -- она у самого поля и в сторе не
 * лежит.
 */

export type FormSeverity = "error" | "warning" | "info" | "success";

/**
 * Полоса под телом окна: сорвавшаяся запись, предупреждение по ходу дела.
 *
 * `code` -- код отказа контроллера (`name_taken`): полоса покажет фразу из
 * каталога `api.*`, если она заведена, и сам код, если нет. `text` -- то, что
 * показать, когда кода нет вовсе.
 */
export type FormNotice = {
  /** Умолчание -- `error`: полоса чаще всего говорит о сорвавшейся записи. */
  severity?: FormSeverity;
  /** Пустая строка убирает заголовок; `undefined` -- умолчание по уровню. */
  title?: string;
  text: string;
  code?: string;
};

export type FormEntry = {
  open: boolean;
  payload?: unknown;
  busy?: boolean;
  notice?: FormNotice;
};

interface FormsState {
  byName: Record<string, FormEntry>;
}

const initialState: FormsState = {
  byName: {},
};

/** Отказ запроса -- полосой уровня `error`, с кодом для перевода. */
export function noticeOfError(err: unknown): FormNotice {
  return { severity: "error", text: errorText(err), code: errorCode(err) };
}

const formsSlice = createSlice({
  name: "forms",
  initialState,
  reducers: {
    openForm(
      state,
      action: PayloadAction<{ name: string; payload?: unknown }>,
    ) {
      /*
       * Открытие -- всегда с чистого листа: полоса и занятость прошлого
       * показа к новой строке отношения не имеют. Иначе окно, закрытое на
       * ошибке и открытое на другой строке, встречает оператора чужим отказом.
       */
      state.byName[action.payload.name] = {
        open: true,
        payload: action.payload.payload,
      };
    },
    closeForm(state, action: PayloadAction<string | undefined>) {
      if (action.payload === undefined) {
        state.byName = {};
        return;
      }
      delete state.byName[action.payload];
    },
    /*
     * Полоса и занятость ставятся только открытому окну: `pending` thunk'а
     * может прийти после того, как оператор закрыл окно, и запись о закрытом
     * окне осталась бы в сторе навсегда.
     */
    setFormBusy(state, action: PayloadAction<{ name: string; busy: boolean }>) {
      const entry = state.byName[action.payload.name];
      if (entry === undefined) {
        return;
      }
      entry.busy = action.payload.busy;
    },
    setFormNotice(
      state,
      action: PayloadAction<{ name: string; notice: FormNotice | null }>,
    ) {
      const entry = state.byName[action.payload.name];
      if (entry === undefined) {
        return;
      }
      if (action.payload.notice === null) {
        delete entry.notice;
        return;
      }
      entry.notice = action.payload.notice;
    },
  },
});

export const { openForm, closeForm, setFormBusy, setFormNotice } =
  formsSlice.actions;
export default formsSlice.reducer;
