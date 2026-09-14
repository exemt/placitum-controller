import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import {
  addAddresses,
  createDataset,
  deleteAddress,
  deleteDataset,
  fetchAddresses,
  fetchContentTypes,
  fetchDatasetContent,
  fetchDatasets,
  putDatasetContent,
  updateDataset,
  type Address,
  type ContentType,
  type Dataset,
  type DatasetContent,
  type DatasetKind,
  type DatasetMode,
  type DatasetType,
} from "../../../api.ts";

interface DatasetsState {
  rows: Dataset[];
  contentTypes: ContentType[];
  addresses: Address[];
  addressesId: string | null;
  content: DatasetContent | null;
  contentId: string | null;
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: DatasetsState = {
  rows: [],
  contentTypes: [],
  addresses: [],
  addressesId: null,
  content: null,
  contentId: null,
  panelId: undefined,
  loading: true,
  error: null,
};

export function parseDraftLines(text: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || seen.has(line)) {
      continue;
    }
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function listMode(active?: boolean, mode?: DatasetMode): DatasetMode {
  if (mode === "active" || mode === "internal") {
    return mode;
  }
  return active === true ? "active" : "internal";
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToText(blob: string): string {
  const raw = atob(blob);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export const loadDatasets = createAsyncThunk(
  "pages/datasets/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return { rows: [] as Dataset[], contentTypes: [] as ContentType[] };
    }
    try {
      const [rows, contentTypes] = await Promise.all([
        fetchDatasets(scope),
        fetchContentTypes(scope),
      ]);
      return { rows, contentTypes };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadAddresses = createAsyncThunk(
  "pages/datasets/loadAddresses",
  async (
    input: { scope: string; datasetId: string },
    { rejectWithValue },
  ) => {
    try {
      return await fetchAddresses(input.scope, input.datasetId);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadContent = createAsyncThunk(
  "pages/datasets/loadContent",
  async (
    input: { scope: string; datasetId: string },
    { rejectWithValue },
  ) => {
    try {
      return await fetchDatasetContent(input.scope, input.datasetId);
    } catch (err: unknown) {
      const message = String(err);
      if (message.includes("not_found")) {
        return null;
      }
      return rejectWithValue(message);
    }
  },
);

export const addAddressThunk = createAsyncThunk(
  "pages/datasets/addAddress",
  async (
    input: {
      scope: string;
      datasetId: string;
      address: string;
      ttlS: number;
    },
    { rejectWithValue },
  ) => {
    try {
      await addAddresses(input.scope, input.datasetId, {
        address: input.address,
        ttl_s: input.ttlS,
      });
      const [addresses, rows] = await Promise.all([
        fetchAddresses(input.scope, input.datasetId),
        fetchDatasets(input.scope),
      ]);
      return { addresses, rows, datasetId: input.datasetId };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const saveDatasetThunk = createAsyncThunk(
  "pages/datasets/save",
  async (
    input: {
      scope: string;
      id: string | null;
      name: string;
      description: string;
      kind: DatasetKind;
      type: DatasetType;
      contentTypeId: string | null;
      mode?: DatasetMode;
      active?: boolean;
      limit?: number;
      ttl?: string;
      /** `hash=md5`: только у списка строк; контроллер запирает у непустого. */
      hash?: boolean;
      ttlS?: number;
      text: string;
      blob: string | null;
    },
    { rejectWithValue },
  ) => {
    try {
      if (input.kind === "content") {
        if (input.id === null) {
          if (input.contentTypeId === null) {
            return rejectWithValue("invalid_content_type");
          }
          const created = await createDataset(input.scope, {
            name: input.name,
            description: input.description,
            kind: "content",
            content_type_id: input.contentTypeId,
            mode: "internal",
          });
          if (input.blob !== null && input.blob.length > 0) {
            await putDatasetContent(input.scope, created.uuid, {
              name: input.name,
              blob: input.blob,
            });
          }
        } else {
          await updateDataset(input.scope, input.id, {
            name: input.name,
            description: input.description,
          });
          if (input.blob !== null && input.blob.length > 0) {
            await putDatasetContent(input.scope, input.id, {
              name: input.name,
              blob: input.blob,
            });
          }
        }
        return await fetchDatasets(input.scope);
      }

      const lines = parseDraftLines(input.text);
      if (input.id === null) {
          const created = await createDataset(input.scope, {
            name: input.name,
            description: input.description,
            kind: "list",
            type: input.type,
            mode: listMode(input.active, input.mode),
            limit: input.limit,
            ttl: listMode(input.active, input.mode) === "active" ? input.ttl : undefined,
            hash: input.hash,
          });
          if (lines.length > 0) {
            await addAddresses(input.scope, created.uuid, {
              text: input.text,
              ttl_s: input.ttlS,
            });
          }
        } else {
          await updateDataset(input.scope, input.id, {
            name: input.name,
            description: input.description,
            mode: listMode(input.active, input.mode),
            limit: input.limit,
            ttl: listMode(input.active, input.mode) === "active" ? input.ttl : undefined,
            hash: input.hash,
          });
        const current = await fetchAddresses(input.scope, input.id);
        const next = new Set(lines);
        const have = new Set(current.map((row) => row.address));
        await Promise.all(
          current
            .filter((row) => !next.has(row.address))
            .map((row) => deleteAddress(input.scope, row.uuid)),
        );
        const added = lines.filter((line) => !have.has(line));
        if (added.length > 0) {
          await addAddresses(input.scope, input.id, {
            addresses: added,
            ttl_s: input.ttlS,
          });
        }
      }
      return await fetchDatasets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Копия набора из строки списка.
 *
 * Двумя дорогами, потому что состав у видов лежит по-разному: у списка адреса
 * копирует сервер (`copy_from` в `POST`), у страницы тело приезжает отдельной
 * ручкой: его сперва читают, а записывают вторым запросом.
 *
 * Образец приходит строкой, а не идентификатором: список отдаёт набор целиком,
 * и второй запрос за тем, что уже лежит в сторе, ничего бы не уточнил.
 */
export const copyDatasetRowThunk = createAsyncThunk(
  "pages/datasets/copyRow",
  async (
    input: { scope: string; source: Dataset; name: string },
    { rejectWithValue },
  ) => {
    const source = input.source;
    try {
      if (source.kind === "content") {
        const created = await createDataset(input.scope, {
          name: input.name,
          description: source.description,
          kind: "content",
          content_type_id: source.content_type_id ?? undefined,
          mode: "internal",
        });
        if (source.size > 0) {
          const body = await fetchDatasetContent(input.scope, source.uuid);
          await putDatasetContent(input.scope, created.uuid, {
            name: input.name,
            blob: body.blob,
          });
        }
      } else {
        await createDataset(input.scope, {
          name: input.name,
          description: source.description,
          kind: source.kind,
          type: source.type,
          mode: source.mode ?? "internal",
          limit: source.limit,
          ttl: source.ttl ?? undefined,
          copy_from: source.uuid,
        });
      }
      return await fetchDatasets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/*
 * Отказ показывает форма (полоса Form.Notice, как у сохранения): 409 `in_use`
 * приходит с местами в detail, и читать его удобнее там, где нажали кнопку.
 */
export const removeDatasetThunk = createAsyncThunk(
  "pages/datasets/remove",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteDataset(input.scope, input.id);
      return await fetchDatasets(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const datasetsSlice = createSlice({
  name: "pages/datasets",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
      state.addresses = [];
      state.addressesId = null;
      state.content = null;
      state.contentId = null;
    },
    closePanel(state) {
      state.panelId = undefined;
      state.addresses = [];
      state.addressesId = null;
      state.content = null;
      state.contentId = null;
    },
    clearDatasetsError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadDatasets.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadDatasets.fulfilled, (state, action) => {
      state.rows = action.payload.rows;
      state.contentTypes = action.payload.contentTypes;
      state.loading = false;
      state.error = null;
      if (
        typeof state.panelId === "string" &&
        !action.payload.rows.some((row) => row.uuid === state.panelId)
      ) {
        state.panelId = undefined;
        state.addresses = [];
        state.addressesId = null;
        state.content = null;
        state.contentId = null;
      }
    });
    builder.addCase(loadDatasets.rejected, (state, action) => {
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadAddresses.fulfilled, (state, action) => {
      state.addresses = action.payload;
      state.addressesId = action.meta.arg.datasetId;
      state.error = null;
    });
    builder.addCase(loadAddresses.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadContent.fulfilled, (state, action) => {
      state.content = action.payload;
      state.contentId = action.meta.arg.datasetId;
      state.error = null;
    });
    builder.addCase(loadContent.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(addAddressThunk.fulfilled, (state, action) => {
      state.addresses = action.payload.addresses;
      state.addressesId = action.payload.datasetId;
      state.rows = action.payload.rows;
      state.error = null;
    });
    builder.addCase(saveDatasetThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.addresses = [];
      state.addressesId = null;
      state.content = null;
      state.contentId = null;
      state.error = null;
    });
    builder.addCase(copyDatasetRowThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.error = null;
    });
    builder.addCase(removeDatasetThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.panelId = undefined;
      state.addresses = [];
      state.addressesId = null;
      state.content = null;
      state.contentId = null;
      state.error = null;
    });
  },
});

export const { openPanel, closePanel, clearDatasetsError } =
  datasetsSlice.actions;
export default datasetsSlice.reducer;
