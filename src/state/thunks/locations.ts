import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { LocationInsert, LocationPatch, LocationView } from "../../locations.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createLocation = createAsyncThunk<LocationView, LocationInsert, ThunkCfg>(
  "locations/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      return await extra.locations.insert(input);
    } catch (err) {
      const mapped = pgWriteReject(err, "location");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const updateLocation = createAsyncThunk<
  LocationView,
  { id: string; patch: LocationPatch },
  ThunkCfg
>("locations/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.locations.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "location");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const reorderLocations = createAsyncThunk<
  LocationView[],
  { serverId: string; ids: string[] },
  ThunkCfg
>("locations/reorder", async ({ serverId, ids }, { extra, rejectWithValue }) => {
  try {
    const rows = await extra.locations.reorder(serverId, ids);

    if (rows === null) {
      return rejectWithValue({ status: 409, error: "order_stale" });
    }

    return rows;
  } catch (err) {
    const mapped = pgWriteReject(err, "location");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteLocation = createAsyncThunk<
  LocationView,
  { id: string },
  ThunkCfg
>("locations/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.locations.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "location");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
