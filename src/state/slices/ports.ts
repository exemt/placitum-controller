import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

import type { Port } from "../../model/listen.ts";
import type { PortBind } from "../../ports.ts";
import { hydrateModel } from "../hydrate.ts";
import { deleteServer } from "../thunks/servers.ts";
import {
  bindPort,
  createPort,
  deletePort,
  unbindPort,
  updatePort,
  updatePortBind,
} from "../thunks/ports.ts";

const portsAdapter = createEntityAdapter<Port, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) => a.port - b.port || a.address.localeCompare(b.address),
});

const bindsAdapter = createEntityAdapter<PortBind, string>({
  selectId: (row) => row.id,
  sortComparer: (a, b) =>
    a.port.port - b.port.port || a.port.address.localeCompare(b.port.address),
});

const portsSlice = createSlice({
  name: "ports",
  initialState: {
    ports: portsAdapter.getInitialState(),
    binds: bindsAdapter.getInitialState(),
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(hydrateModel.fulfilled, (state, action) => {
      portsAdapter.setAll(state.ports, action.payload.ports);
      bindsAdapter.setAll(state.binds, action.payload.binds);
    });
    builder.addCase(createPort.fulfilled, (state, action) => {
      portsAdapter.upsertOne(state.ports, action.payload);
    });
    builder.addCase(updatePort.fulfilled, (state, action) => {
      portsAdapter.upsertOne(state.ports, action.payload);
      for (const bind of Object.values(state.binds.entities)) {
        if (bind !== undefined && bind.portId === action.payload.id) {
          bindsAdapter.upsertOne(state.binds, {
            ...bind,
            port: action.payload,
          });
        }
      }
    });
    builder.addCase(deletePort.fulfilled, (state, action) => {
      portsAdapter.removeOne(state.ports, action.payload.id);
    });
    builder.addCase(bindPort.fulfilled, (state, action) => {
      bindsAdapter.upsertOne(state.binds, action.payload);
    });
    builder.addCase(updatePortBind.fulfilled, (state, action) => {
      bindsAdapter.upsertOne(state.binds, action.payload);
    });
    builder.addCase(unbindPort.fulfilled, (state, action) => {
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

export const portsReducer = portsSlice.reducer;

export const portSelectors = portsAdapter.getSelectors(
  (state: { ports: ReturnType<typeof portsSlice.reducer> }) => state.ports.ports,
);

export const portBindSelectors = bindsAdapter.getSelectors(
  (state: { ports: ReturnType<typeof portsSlice.reducer> }) => state.ports.binds,
);

export function selectPortsInSpace(
  state: { ports: ReturnType<typeof portsSlice.reducer> },
  spaceId: string,
): Port[] {
  return portSelectors.selectAll(state).filter((row) => row.httpSpaceId === spaceId);
}

export function selectBindsInSpace(
  state: { ports: ReturnType<typeof portsSlice.reducer> },
  spaceId: string,
): PortBind[] {
  return portBindSelectors
    .selectAll(state)
    .filter((row) => row.port.httpSpaceId === spaceId);
}

export function selectBindsOnServer(
  state: { ports: ReturnType<typeof portsSlice.reducer> },
  serverId: string,
): PortBind[] {
  return portBindSelectors
    .selectAll(state)
    .filter((row) => row.serverId === serverId);
}
