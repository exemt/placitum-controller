import { createAsyncThunk } from "@reduxjs/toolkit";

import { pgWriteReject } from "../../http-error.ts";
import type { RuleFile } from "../../model/rule-set.ts";
import type { RuleFileInsert, RuleFilePatch } from "../../rule-files.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createRuleFile = createAsyncThunk<RuleFile, RuleFileInsert, ThunkCfg>(
  "ruleFiles/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      return await extra.ruleFiles.insert(input);
    } catch (err) {
      const mapped = pgWriteReject(err, "ruleFile");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const deleteRuleFile = createAsyncThunk<
  RuleFile,
  { id: string },
  ThunkCfg
>("ruleFiles/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ruleFiles.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ruleFile");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const updateRuleFile = createAsyncThunk<
  RuleFile,
  { id: string; patch: RuleFilePatch },
  ThunkCfg
>("ruleFiles/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.ruleFiles.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "ruleFile");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
