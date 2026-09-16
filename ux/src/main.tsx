import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import App from "./App.tsx";
import { LocaleProvider } from "./i18n/index.ts";
import { store } from "./store/index.ts";
import { AppThemeProvider } from "./theme.tsx";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <AppThemeProvider>
        <LocaleProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </LocaleProvider>
      </AppThemeProvider>
    </Provider>
  </StrictMode>,
);
