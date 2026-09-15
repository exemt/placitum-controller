import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { LocationView } from "../../locations.ts";
import type { Server } from "../../model/server.ts";
import type { ServerInsert, ServerPatch } from "../../servers.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createServer = createAsyncThunk<
  { server: Server; locations: LocationView[] },
  ServerInsert,
  ThunkCfg
>(
  "servers/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      const server = await extra.servers.insert(input);
      const locations = await extra.locations.list(undefined, server.id);
      return { server, locations };
    } catch (err) {
      const mapped = pgWriteReject(err, "server");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const updateServer = createAsyncThunk<
  Server,
  { id: string; patch: ServerPatch },
  ThunkCfg
>("servers/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.servers.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "server");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteServer = createAsyncThunk<Server, { id: string }, ThunkCfg>(
  "servers/delete",
  async ({ id }, { extra, rejectWithValue }) => {
    try {
      const row = await extra.servers.delete(id);

      if (row === null) {
        return rejectWithValue({ status: 404, error: "not_found" });
      }

      return row;
    } catch (err) {
      const mapped = pgWriteReject(err, "server");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);
