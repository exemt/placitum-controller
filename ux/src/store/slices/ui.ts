import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Locale } from "../../i18n/locale.ts";
import {
  readAcceptance,
  writeAcceptance,
  type LicenseAcceptance,
} from "../../license.ts";

export type ThemeMode = "dark" | "light";

const LOCALE_KEY = "waf.locale";
const THEME_KEY = "waf.theme";

function readLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return value === "en" || value === "ru" ? value : "ru";
  } catch {
    return "ru";
  }
}

function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "dark";
  } catch {
    return "dark";
  }
}

interface UiState {
  locale: Locale;
  themeMode: ThemeMode;
  /** Принятие лицензии в этом браузере; `null` -- ещё не принимали. */
  license: LicenseAcceptance | null;
}

const initialState: UiState = {
  locale: readLocale(),
  themeMode: readTheme(),
  license: readAcceptance(),
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setLocale(state, action: PayloadAction<Locale>) {
      state.locale = action.payload;
      localStorage.setItem(LOCALE_KEY, action.payload);
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
      localStorage.setItem(THEME_KEY, action.payload);
    },
    toggleTheme(state) {
      state.themeMode = state.themeMode === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, state.themeMode);
    },
    toggleLocale(state) {
      state.locale = state.locale === "ru" ? "en" : "ru";
      localStorage.setItem(LOCALE_KEY, state.locale);
    },
    acceptLicense(state) {
      state.license = writeAcceptance();
    },
  },
});

export const {
  setLocale,
  setThemeMode,
  toggleTheme,
  toggleLocale,
  acceptLicense,
} = uiSlice.actions;
export default uiSlice.reducer;
