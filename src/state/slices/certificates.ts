import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { Certificate } from "../../model/listen.ts";
import type { BoundCertificate } from "../../model/server.ts";
import { hydrateModel } from "../hydrate.ts";
import { deleteServer } from "../thunks/servers.ts";
import {
  bindCertificate,
  clearCertificateCrl,
  createCertificate,
  deleteCertificate,
  setCertificateCrl,
  unbindCertificate,
} from "../thunks/certificates.ts";

const adapter = createEntityAdapter<Certificate, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const bindsAdapter = createEntityAdapter<BoundCertificate, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.kind.localeCompare(b.kind) || a.certificate.name.localeCompare(b.certificate.name),
});

const certificatesSlice = createSlice({
  name: "certificates",
  initialState: {
    certificates: adapter.getInitialState(),
    binds: bindsAdapter.getInitialState(),
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state.certificates, action.payload.certificates);
      bindsAdapter.setAll(state.binds, action.payload.certificateBinds);
    });
    builder.addCase(createCertificate.fulfilled, (state, action) => {
      adapter.upsertOne(state.certificates, action.payload);
    });
    builder.addCase(deleteCertificate.fulfilled, (state, action) => {
      adapter.removeOne(state.certificates, action.payload.id);
      const gone = Object.values(state.binds.entities)
        .filter((row) => row !== undefined && row.certificateId === action.payload.id)
        .map((row) => row.id);
      bindsAdapter.removeMany(state.binds, gone);
    });
    builder.addCase(setCertificateCrl.fulfilled, (state, action) => {
      adapter.upsertOne(state.certificates, action.payload);
    });
    builder.addCase(clearCertificateCrl.fulfilled, (state, action) => {
      adapter.upsertOne(state.certificates, action.payload);
    });
    builder.addCase(bindCertificate.fulfilled, (state, action) => {
      bindsAdapter.upsertOne(state.binds, action.payload);
    });
    builder.addCase(unbindCertificate.fulfilled, (state, action) => {
      bindsAdapter.removeOne(state.binds, action.payload.id);
    });
    builder.addCase(deleteServer.fulfilled, (state, action) => {
      const gone = Object.values(state.binds.entities)
        .filter((row) => row !== undefined && row.serverId === action.payload.id)
        .map((row) => row.id);
      bindsAdapter.removeMany(state.binds, gone);
    });
  },
});

export const certificatesReducer = certificatesSlice.reducer;

export const certificateSelectors = adapter.getSelectors(
  (state: { certificates: ReturnType<typeof certificatesSlice.reducer> }) =>
    state.certificates.certificates,
);

export const certificateBindSelectors = bindsAdapter.getSelectors(
  (state: { certificates: ReturnType<typeof certificatesSlice.reducer> }) =>
    state.certificates.binds,
);

export function selectCertificatesInSpace(
  state: { certificates: ReturnType<typeof certificatesSlice.reducer> },
  spaceId: string,
): Certificate[] {
  return certificateSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}

export function selectCertBindsOnServer(
  state: { certificates: ReturnType<typeof certificatesSlice.reducer> },
  serverId: string,
): BoundCertificate[] {
  return certificateBindSelectors
    .selectAll(state)
    .filter((row) => row.serverId === serverId);
}
