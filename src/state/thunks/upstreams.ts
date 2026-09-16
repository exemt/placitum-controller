import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { UpstreamTree } from "../../model/upstream.ts";
import type { UpstreamInsert, UpstreamPatch } from "../../upstreams.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createUpstream = createAsyncThunk<UpstreamTree, UpstreamInsert, ThunkCfg>(
  "upstreams/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      return await extra.upstreams.insert(input);
    } catch (err) {
      const mapped = pgWriteReject(err, "upstream");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const updateUpstream = createAsyncThunk<
  UpstreamTree,
  { id: string; patch: UpstreamPatch },
  ThunkCfg
>("upstreams/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.upstreams.update(id, patch);
    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }
    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "upstream");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteUpstream = createAsyncThunk<
  UpstreamTree,
  { id: string },
  ThunkCfg
>("upstreams/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.upstreams.delete(id);
    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }
    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "upstream");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
