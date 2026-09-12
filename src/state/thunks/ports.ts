import { createAsyncThunk } from "@reduxjs/toolkit";

import { isRejectPayload, pgWriteReject } from "../../http-error.ts";
import type { Port } from "../../model/listen.ts";
import type { PortBind, PortInsert, PortPatch } from "../../ports.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createPort = createAsyncThunk<Port, PortInsert, ThunkCfg>(
  "ports/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      return await extra.ports.insert(input);
    } catch (err) {
      const mapped = pgWriteReject(err, "port");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const updatePort = createAsyncThunk<
  Port,
  { id: string; patch: PortPatch },
  ThunkCfg
>("ports/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ports.update(id, patch);
    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }
    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "port");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deletePort = createAsyncThunk<Port, { id: string }, ThunkCfg>(
  "ports/delete",
  async ({ id }, { extra, rejectWithValue }) => {
    try {
      const row = await extra.ports.delete(id);
      if (row === null) {
        return rejectWithValue({ status: 404, error: "not_found" });
      }
      return row;
    } catch (err) {
      const mapped = pgWriteReject(err, "port");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const bindPort = createAsyncThunk<
  PortBind,
  { serverId: string; portId: string; defaultServer: boolean },
  ThunkCfg
>("ports/bind", async (input, { extra, rejectWithValue }) => {
  try {
    return await extra.ports.bind(input);
  } catch (err) {
    if (isRejectPayload(err)) {
      return rejectWithValue(err);
    }
    const mapped = pgWriteReject(err, "port");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const updatePortBind = createAsyncThunk<
  PortBind,
  { id: string; defaultServer: boolean },
  ThunkCfg
>("ports/updateBind", async ({ id, defaultServer }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ports.updateBind(id, { defaultServer });
    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }
    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "port");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const unbindPort = createAsyncThunk<PortBind, { id: string }, ThunkCfg>(
  "ports/unbind",
  async ({ id }, { extra, rejectWithValue }) => {
    try {
      const row = await extra.ports.unbind(id);
      if (row === null) {
        return rejectWithValue({ status: 404, error: "not_found" });
      }
      return row;
    } catch (err) {
      const mapped = pgWriteReject(err, "port");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);
