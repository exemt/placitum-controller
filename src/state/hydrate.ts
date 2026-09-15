import { createAsyncThunk } from "@reduxjs/toolkit";

import type { ThunkExtra } from "./extra.ts";

export const hydrateModel = createAsyncThunk<
  Awaited<ReturnType<typeof loadSnapshot>>,
  void,
  { extra: ThunkExtra }
>("model/hydrate", async (_arg, { extra }) => loadSnapshot(extra));

async function loadSnapshot(extra: ThunkExtra) {
  const [
    spaces,
    datasets,
    inspectors,
    ruleFiles,
    ruleSets,
    ipCountries,
    ipProfiles,
    servers,
    locations,
    ports,
    binds,
    certificates,
    certificateBinds,
    upstreams,
  ] = await Promise.all([
    extra.spaces.list(),
    extra.datasets.list(),
    extra.inspectors.list(),
    extra.ruleFiles.list(),
    extra.ruleSets.list(),
    extra.ipCountries.list(),
    extra.ipProfiles.list(),
    extra.servers.list(),
    extra.locations.list(),
    extra.ports.list(),
    extra.ports.listBinds(),
    extra.certificates.list(),
    extra.certificates.listBinds(),
    extra.upstreams.list(),
  ]);

  return {
    spaces,
    datasets,
    inspectors,
    ruleFiles,
    ruleSets,
    ipCountries,
    ipProfiles,
    servers,
    locations,
    ports,
    binds,
    certificates,
    certificateBinds,
    upstreams,
  };
}
