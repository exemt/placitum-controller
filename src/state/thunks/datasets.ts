import { createHash } from "node:crypto";

import { createAsyncThunk } from "@reduxjs/toolkit";

import type { DatasetInsert, DatasetPatch } from "../../datasets.ts";
import { pgWriteReject } from "../../http-error.ts";
import type {
  Dataset,
  DatasetAddress,
  DatasetContent,
  DatasetSource,
} from "../../model/http-space.ts";
import type { ThunkExtra, KeeperReply } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export function md5Hex(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

export const createDataset = createAsyncThunk<Dataset, DatasetInsert, ThunkCfg>(
  "datasets/create",
  async (input, { extra, rejectWithValue }) => {
    try {
      return await extra.datasets.insert(input);
    } catch (err) {
      const mapped = pgWriteReject(err, "dataset");
      return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
    }
  },
);

export const updateDataset = createAsyncThunk<
  Dataset,
  { id: string; patch: DatasetPatch },
  ThunkCfg
>("datasets/update", async ({ id, patch }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.datasets.update(id, patch);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteDataset = createAsyncThunk<
  Dataset,
  { id: string },
  ThunkCfg
>("datasets/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.datasets.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

function keeperReject(reply: KeeperReply): { status: number; error: string } {
  switch (reply.error) {
    case "full":
      return { status: 400, error: "addresses_over_max" };
    case "wrong_type":
    case "too_long":
      return { status: 400, error: "invalid_address" };
    case "unknown_set":
    case "not_ready":
    case "store_unavailable":
    case "keeper_unreachable":
      return { status: 503, error: "keeper_unavailable" };
    case "overloaded":
      return { status: 503, error: "keeper_overloaded" };
    default:
      return { status: 502, error: reply.error ?? "keeper_error" };
  }
}

export const replaceAddresses = createAsyncThunk<
  { dataset: Dataset; count: number },
  { datasetId: string; addresses: string[] },
  ThunkCfg
>("datasets/replaceAddresses", async ({ datasetId, addresses }, { extra, rejectWithValue }) => {
  try {
    const before = await extra.datasets.get(datasetId);

    if (before === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (before.active) {
      return rejectWithValue({ status: 400, error: "active_list" });
    }

    const stored = before.hash === true ? addresses.map(md5Hex) : addresses;
    const count = await extra.datasets.replaceAddresses(datasetId, stored);

    if (count === "missing") {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (count === "wrong_kind") {
      return rejectWithValue({ status: 400, error: "wrong_kind" });
    }

    if (count === "full") {
      return rejectWithValue({ status: 400, error: "addresses_over_max" });
    }

    const dataset = await extra.datasets.get(datasetId);

    if (dataset === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return { dataset, count };
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const setSource = createAsyncThunk<
  Dataset,
  { id: string; source: DatasetSource | null },
  ThunkCfg
>("datasets/setSource", async ({ id, source }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.datasets.setSource(id, source);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const addAddresses = createAsyncThunk<
  { dataset: Dataset; addresses: DatasetAddress[] },
  { datasetId: string; addresses: string[]; ttlS?: number },
  ThunkCfg
>("datasets/addAddresses", async ({ datasetId, addresses, ttlS }, { extra, rejectWithValue }) => {
  try {
    const dataset = await extra.datasets.get(datasetId);

    if (dataset === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (dataset.kind !== "list") {
      return rejectWithValue({ status: 400, error: "wrong_kind" });
    }

    const stored = dataset.hash === true ? addresses.map(md5Hex) : addresses;

    if (dataset.active) {
      const unique = [...new Set(stored)];

      for (const value of unique) {
        const reply = await extra.bus.datasetWrite(dataset.name, "add", value, ttlS, {
          origin: "panel",
          hashed: dataset.hash === true,
        });

        if (!reply.ok) {
          return rejectWithValue(keeperReject(reply));
        }
      }

      const rows = await extra.datasets.addressesByValue(datasetId, unique);

      return { dataset, addresses: rows };
    }

    const rows = await extra.datasets.insertAddresses(datasetId, stored, {
      ttlS,
    });

    if (rows === "missing") {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (rows === "wrong_kind") {
      return rejectWithValue({ status: 400, error: "wrong_kind" });
    }

    if (rows === "full") {
      return rejectWithValue({ status: 400, error: "addresses_over_max" });
    }

    return { dataset, addresses: rows };
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const removeAddress = createAsyncThunk<
  { dataset: Dataset; address: DatasetAddress },
  { addressId: string },
  ThunkCfg
>("datasets/removeAddress", async ({ addressId }, { extra, rejectWithValue }) => {
  try {
    const address = await extra.datasets.getAddress(addressId);

    if (address === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    const dataset = await extra.datasets.get(address.datasetId);

    if (dataset === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (dataset.active) {
      const reply = await extra.bus.datasetWrite(dataset.name, "remove", address.address, undefined, {
        origin: "panel",
      });

      if (!reply.ok) {
        return rejectWithValue(keeperReject(reply));
      }

      return { dataset, address };
    }

    const removed = await extra.datasets.deleteAddress(addressId);

    if (removed === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return { dataset, address: removed };
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const putContent = createAsyncThunk<
  { dataset: Dataset; content: DatasetContent },
  { datasetId: string; name: string; body: Buffer },
  ThunkCfg
>("datasets/putContent", async ({ datasetId, name, body }, { extra, rejectWithValue }) => {
  try {
    const content = await extra.datasets.putContent(datasetId, name, body);

    if (content === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    if (content === "wrong_kind") {
      return rejectWithValue({ status: 400, error: "wrong_kind" });
    }

    const dataset = await extra.datasets.get(datasetId);

    if (dataset === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return { dataset, content };
  } catch (err) {
    const mapped = pgWriteReject(err, "dataset");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
