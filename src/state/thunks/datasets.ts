import { createHash } from "node:crypto";

import { createAsyncThunk } from "@reduxjs/toolkit";

import type { DatasetInsert, DatasetPatch } from "../../datasets.ts";
import { pgWriteReject } from "../../http-error.ts";
import type {
  Dataset,
  DatasetAddress,
  DatasetContent,
} from "../../model/http-space.ts";
import type { ThunkExtra, KeeperReply } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

/*
 * Значение набора с hash=md5: строчный hex, 32 байта. Той же функцией считают
 * модуль (ngx_http_waf_md5_hex) и keeper (set.MD5Hex); разойдись они хоть в
 * регистре, набор перестал бы совпадать с тем, что в него кладут.
 */
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

/*
 * Отказ keeper -- отказ панели теми же словами (docs/spec.md репозитория keeper). Недоступный
 * keeper -- 503: запись в живой набор без него сделать некому, а писать её в
 * Postgres мимо него значило бы завести второго писателя состава.
 */
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
    /* Очередь набора полна: keeper жив, но не успевает. Повторять не раньше чем через секунду. */
    case "overloaded":
      return { status: 503, error: "keeper_overloaded" };
    default:
      return { status: 502, error: reply.error ?? "keeper_error" };
  }
}

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

    /*
     * hash=md5: оператор пишет сессию, в состав ложится её md5 -- той же
     * функцией, что у модуля и keeper. Считается здесь, а не в keeper, потому
     * что internal-набор до keeper не доходит, а искать записи по значению
     * (addressesByValue) надо уже хешем.
     */
    const stored = dataset.hash === true ? addresses.map(md5Hex) : addresses;

    if (dataset.active) {
      /* Живой набор: пишет keeper, контроллер только просит и перечитывает. */
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
