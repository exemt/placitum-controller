import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { IpProfile, IpProfileMeta } from "../../model/ip-profile.ts";
import { hydrateModel } from "../hydrate.ts";
import {
  createIpProfile,
  deleteIpProfile,
  updateIpProfile,
} from "../thunks/ip-profiles.ts";

const adapter = createEntityAdapter<IpProfileMeta, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

function metaOf(row: IpProfile): IpProfileMeta {
  return {
    id: row.id,
    httpSpaceId: row.httpSpaceId,
    name: row.name,
    description: row.description,
    rules: row.rules.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ipProfilesSlice = createSlice({
  name: "ipProfiles",
  initialState: adapter.getInitialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      adapter.setAll(state, action.payload.ipProfiles);
    });
    builder.addCase(createIpProfile.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(updateIpProfile.fulfilled, (state, action) => {
      adapter.upsertOne(state, metaOf(action.payload));
    });
    builder.addCase(deleteIpProfile.fulfilled, (state, action) => {
      adapter.removeOne(state, action.payload.id);
    });
  },
});

export const ipProfilesReducer = ipProfilesSlice.reducer;

export const ipProfileSelectors = adapter.getSelectors(
  (state: { ipProfiles: ReturnType<typeof ipProfilesSlice.reducer> }) =>
    state.ipProfiles,
);

export function selectIpProfilesInSpace(
  state: { ipProfiles: ReturnType<typeof ipProfilesSlice.reducer> },
  spaceId: string,
): IpProfileMeta[] {
  return ipProfileSelectors
    .selectAll(state)
    .filter((row) => row.httpSpaceId === spaceId);
}
