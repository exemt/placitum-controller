import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { IpProfile } from "../../model/ip-profile.ts";
import type { IpProfileInsert, IpProfilePatch } from "../../ip-profiles.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createIpProfile = createAsyncThunk<
  IpProfile,
  IpProfileInsert,
  ThunkCfg
>("ipProfiles/create", async (input, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ipProfiles.insert(input);

    if (typeof row === "string") {
      return rejectWithValue({ status: 400, error: row });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ipProfile");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteIpProfile = createAsyncThunk<
  IpProfile,
  { id: string },
  ThunkCfg
>("ipProfiles/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ipProfiles.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ipProfile");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const updateIpProfile = createAsyncThunk<
  IpProfile,
  { id: string; patch: IpProfilePatch },
  ThunkCfg
>("ipProfiles/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ipProfiles.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (typeof row === "string") {
      return rejectWithValue({ status: 400, error: row });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ipProfile");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
