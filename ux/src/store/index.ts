import { combineReducers, configureStore } from "@reduxjs/toolkit";

import convergenceReducer from "./slices/convergence.ts";
import fleetReducer from "./slices/fleet.ts";
import inspectorsLiveReducer from "./slices/inspectors.ts";
import fleetPageReducer from "./slices/pages/fleet.ts";
import datasetsReducer from "./slices/pages/datasets.ts";
import listsReducer from "./slices/pages/lists.ts";
import profilesReducer from "./slices/pages/profiles.ts";
import ipCountriesReducer from "./slices/pages/ip-countries.ts";
import ipAsnsReducer from "./slices/pages/ip-asns.ts";
import ipProfilesReducer from "./slices/pages/ip-profiles.ts";
import ipSetsReducer from "./slices/pages/ip-sets.ts";
import authReducer from "./slices/pages/auth.ts";
import captchaReducer from "./slices/pages/captcha.ts";
import jsonReducer from "./slices/pages/json.ts";
import counterReducer from "./slices/pages/counter.ts";
import actionProfilesReducer from "./slices/pages/action-profiles.ts";
import cookieProfilesReducer from "./slices/pages/cookie-profiles.ts";
import vlaiProfilesReducer from "./slices/pages/vlai-profiles.ts";
import rewriteProfilesReducer from "./slices/pages/rewrite-profiles.ts";
import configReducer from "./slices/pages/config.ts";
import inspectorCatalogReducer from "./slices/pages/inspector-catalog.ts";
import inspectorsPageReducer from "./slices/pages/inspectors.ts";
import certificatesReducer from "./slices/pages/certificates.ts";
import pathsReducer from "./slices/pages/paths.ts";
import portsReducer from "./slices/pages/ports.ts";
import serversReducer from "./slices/pages/servers.ts";
import upstreamsReducer from "./slices/pages/upstreams.ts";
import sessionReducer from "./slices/session.ts";
import uiReducer from "./slices/ui.ts";
import formsReducer from "./slices/forms.ts";

const pagesReducer = combineReducers({
  fleet: fleetPageReducer,
  datasets: datasetsReducer,
  lists: listsReducer,
  profiles: profilesReducer,
  ipCountries: ipCountriesReducer,
  ipAsns: ipAsnsReducer,
  ipProfiles: ipProfilesReducer,
  ipSets: ipSetsReducer,
  auth: authReducer,
  captcha: captchaReducer,
  json: jsonReducer,
  counter: counterReducer,
  actionProfiles: actionProfilesReducer,
  cookieProfiles: cookieProfilesReducer,
  vlaiProfiles: vlaiProfilesReducer,
  rewriteProfiles: rewriteProfilesReducer,
  inspectors: inspectorsPageReducer,
  inspectorCatalog: inspectorCatalogReducer,
  config: configReducer,
  servers: serversReducer,
  paths: pathsReducer,
  ports: portsReducer,
  certificates: certificatesReducer,
  upstreams: upstreamsReducer,
});

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    session: sessionReducer,
    fleet: fleetReducer,
    convergence: convergenceReducer,
    inspectors: inspectorsLiveReducer,
    pages: pagesReducer,
    forms: formsReducer,
  },
  middleware: (getDefault) =>
    getDefault({ serializableCheck: false, immutableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
