import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { errorCode, errorText } from "../../errors.ts";

export type FormSeverity = "error" | "warning" | "info" | "success";

export type FormNotice = {
  severity?: FormSeverity;
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
