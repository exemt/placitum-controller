import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { RuleSet } from "../../model/rule-set.ts";
import type { RuleSetInsert, RuleSetPatch } from "../../rule-sets.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createRuleSet = createAsyncThunk<RuleSet, RuleSetInsert, ThunkCfg>(
  "ruleSets/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      const row = await extra.ruleSets.insert(input);

      if (row === "unknown_file") {
        return rejectWithValue({ status: 400, error: "unknown_file" });
      }

      if (row === "unknown_data_file") {
        return rejectWithValue({ status: 400, error: "unknown_data_file" });
      }

      return row;
    } catch (err) {
      const mapped = pgWriteReject(err, "ruleSet");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const deleteRuleSet = createAsyncThunk<
  RuleSet,
  { id: string },
  ThunkCfg
>("ruleSets/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ruleSets.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ruleSet");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const updateRuleSet = createAsyncThunk<
  RuleSet,
  { id: string; patch: RuleSetPatch },
  ThunkCfg
>("ruleSets/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ruleSets.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (row === "unknown_file") {
      return rejectWithValue({ status: 400, error: "unknown_file" });
    }

    if (row === "unknown_data_file") {
      return rejectWithValue({ status: 400, error: "unknown_data_file" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ruleSet");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
