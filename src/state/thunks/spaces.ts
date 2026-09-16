import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { HttpSpace } from "../../model/http-space.ts";
import type { SpaceHttpPatch } from "../../spaces.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const updateSpace = createAsyncThunk<
  HttpSpace,
  { id: string; patch: SpaceHttpPatch },
  ThunkCfg
>("spaces/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.spaces.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ruleSet");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
