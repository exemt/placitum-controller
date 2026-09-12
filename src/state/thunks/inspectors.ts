import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { InspectorInsert, InspectorPatch } from "../../inspectors.ts";
import type { Inspector } from "../../model/http-space.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createInspector = createAsyncThunk<
  Inspector,
  InspectorInsert,
  ThunkCfg
>("inspectors/create", async (input, { extra, rejectWithValue }) => {
  try {
    return await extra.inspectors.insert(input);
  } catch (err) {
    const mapped = pgWriteReject(err, "inspector");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const updateInspector = createAsyncThunk<
  Inspector,
  { id: string; patch: InspectorPatch },
  ThunkCfg
>("inspectors/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.inspectors.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "inspector");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteInspector = createAsyncThunk<
  Inspector,
  { id: string },
  ThunkCfg
>("inspectors/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.inspectors.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "inspector");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
