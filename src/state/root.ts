import { combineReducers } from "@reduxjs/toolkit";

import { certificatesReducer } from "./slices/certificates.ts";
import { convergenceReducer } from "./slices/convergence.ts";
import { datasetsReducer } from "./slices/datasets.ts";
import { inspectorsReducer } from "./slices/inspectors.ts";
import { fleetReducer } from "./slices/fleet.ts";
import { locationsReducer } from "./slices/locations.ts";
import { portsReducer } from "./slices/ports.ts";
import { ipCountriesReducer } from "./slices/ip-countries.ts";
import { ipProfilesReducer } from "./slices/ip-profiles.ts";
import { ruleFilesReducer } from "./slices/rule-files.ts";
import { ruleSetsReducer } from "./slices/rule-sets.ts";
import { serversReducer } from "./slices/servers.ts";
import { spacesReducer } from "./slices/spaces.ts";
import { upstreamsReducer } from "./slices/upstreams.ts";

export const rootReducer = combineReducers({
  spaces: spacesReducer,
  datasets: datasetsReducer,
  inspectors: inspectorsReducer,
  ruleFiles: ruleFilesReducer,
  ruleSets: ruleSetsReducer,
  ipCountries: ipCountriesReducer,
  ipProfiles: ipProfilesReducer,
  servers: serversReducer,
  locations: locationsReducer,
  ports: portsReducer,
  certificates: certificatesReducer,
  upstreams: upstreamsReducer,
  fleet: fleetReducer,
  convergence: convergenceReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
