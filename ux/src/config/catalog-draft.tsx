import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createDataset,
  deleteDenyResponse,
  deleteLogFormat,
  fetchBodyStores,
  fetchDatasets,
  fetchDenyResponses,
  fetchLogFormats,
  saveBodyStore,
  saveDenyResponse,
  saveLogFormat,
  updateDataset,
  type BodyStoreRow,
  type Dataset,
  type DatasetMode,
  type DatasetType,
  type DenyResponseRow,
  type LogFormatRow,
} from "../api.ts";
import { useAppSelector } from "../store/hooks.ts";

const NEW_ID = "new:";

export function isNewRow(uuid: string): boolean {
  return uuid.startsWith(NEW_ID);
}

const isNew = isNewRow;

interface Snapshot {
  datasets: Dataset[];
  deny: DenyResponseRow[];
  stores: BodyStoreRow[];
  formats: LogFormatRow[];
}

function copySnap(snap: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(snap)) as Snapshot;
}

interface ListSeed {
  copyFrom?: string;
}

export interface NewList {
  name: string;
  type: DatasetType;
  mode: DatasetMode;
  limit: number;
  ttl?: string;
  hash?: boolean;
  copyFrom?: string;
}

type DatasetUpdate = Parameters<typeof updateDataset>[2];

function datasetUpdateOf(base: Dataset, row: Dataset): DatasetUpdate | null {
  const out: DatasetUpdate = { name: row.name };
  let changed = row.name !== base.name;
  if (row.max_entries !== base.max_entries) {
    out.limit = row.max_entries;
    changed = true;
  }
  const ttl = (r: Dataset) => (r.ttl ?? "").trim();
  if (ttl(row) !== "" && ttl(row) !== ttl(base)) {
    out.ttl = ttl(row);
    changed = true;
  }
  const declared = (r: Dataset) => r.in_nginx !== false;
  if (declared(row) !== declared(base)) {
    out.in_nginx = declared(row);
    changed = true;
  }
  return changed ? out : null;
}

const denyBody = (r: DenyResponseRow) =>
  JSON.stringify({ name: r.name, type: r.type, spec: r.spec });
const storeBody = (r: BodyStoreRow) => JSON.stringify({ name: r.name, spec: r.spec });
const formatBody = (r: LogFormatRow) => JSON.stringify({ name: r.name, format: r.format });

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CatalogDraft {
  loaded: boolean;
  lists: Dataset[];
  pages: Dataset[];
  deny: DenyResponseRow[];
  stores: BodyStoreRow[];
  formats: LogFormatRow[];
  error: string | null;
  dirty: boolean;
  saving: boolean;
  patchList: (
    uuid: string,
    patch: { name?: string; limit?: number; ttl?: string; in_nginx?: boolean },
  ) => void;
  addList: (input: NewList) => void;
  patchDeny: (uuid: string, patch: Partial<Omit<DenyResponseRow, "uuid">>) => void;
  addDeny: (input: Omit<DenyResponseRow, "uuid">) => void;
  removeDeny: (uuid: string) => void;
  patchStore: (uuid: string, spec: BodyStoreRow["spec"]) => void;
  addStore: (spec: BodyStoreRow["spec"]) => void;
  patchFormat: (uuid: string, patch: Partial<Omit<LogFormatRow, "uuid">>) => void;
  addFormat: (input: { name: string; format: string }) => void;
  removeFormat: (uuid: string) => void;
  save: () => Promise<void>;
  reset: () => void;
}

export function useHttpCatalogDraft(): CatalogDraft {
  const scope = useAppSelector((s) => s.session.scope);
  const [base, setBase] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<Snapshot | null>(null);
  const [seeds, setSeeds] = useState<Record<string, ListSeed>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (scope === null) {
      return;
    }
    try {
      const [datasets, deny, stores, formats] = await Promise.all([
        fetchDatasets(scope),
        fetchDenyResponses(scope),
        fetchBodyStores(scope),
        fetchLogFormats(scope),
      ]);
      const snap: Snapshot = { datasets, deny, stores, formats };
      setBase(snap);
      setRows(copySnap(snap));
      setSeeds({});
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [scope]);

  useEffect(() => {
    setBase(null);
    setRows(null);
    setSeeds({});
    void load();
  }, [load]);

  const patchRows = useCallback((fn: (cur: Snapshot) => Snapshot) => {
    setRows((cur) => (cur === null ? cur : fn(cur)));
  }, []);

  const patchList = useCallback<CatalogDraft["patchList"]>(
    (uuid, patch) => {
      if (isNew(uuid) && patch.in_nginx === false) {
        patchRows((cur) => ({
          ...cur,
          datasets: cur.datasets.filter((r) => r.uuid !== uuid),
        }));
        setSeeds((cur) => {
          const next = { ...cur };
          delete next[uuid];
          return next;
        });
        return;
      }
      patchRows((cur) => ({
        ...cur,
        datasets: cur.datasets.map((r) =>
          r.uuid === uuid
            ? {
                ...r,
                name: patch.name ?? r.name,
                max_entries: patch.limit ?? r.max_entries,
                ttl: patch.ttl === undefined ? r.ttl : patch.ttl,
                in_nginx: patch.in_nginx ?? r.in_nginx,
              }
            : r,
        ),
      }));
    },
    [patchRows],
  );

  const addList = useCallback<CatalogDraft["addList"]>(
    (input) => {
      const uuid = `${NEW_ID}${String(++seq.current)}`;
      const active = input.mode === "active";
      setSeeds((cur) => ({ ...cur, [uuid]: { copyFrom: active ? undefined : input.copyFrom } }));
      patchRows((cur) => ({
        ...cur,
        datasets: [
          ...cur.datasets,
          {
            uuid,
            http_space_id: "",
            name: input.name,
            description: "",
            kind: "list",
            type: input.type,
            content_type_id: null,
            max_entries: input.limit,
            active,
            in_nginx: true,
            mode: input.mode,
            ttl: active && input.ttl !== undefined && input.ttl !== "" ? input.ttl : null,
            hash: input.type === "string" && input.hash === true,
            size: 0,
            vars: null,
            linked: false,
            linked_sets: [],
            created_at: "",
            updated_at: "",
          },
        ],
      }));
    },
    [patchRows],
  );

  const patchDeny = useCallback<CatalogDraft["patchDeny"]>(
    (uuid, patch) => {
      patchRows((cur) => ({
        ...cur,
        deny: cur.deny.map((r) => (r.uuid === uuid ? { ...r, ...patch } : r)),
      }));
    },
    [patchRows],
  );

  const addDeny = useCallback<CatalogDraft["addDeny"]>(
    (input) => {
      const uuid = `${NEW_ID}${String(++seq.current)}`;
      patchRows((cur) => ({ ...cur, deny: [...cur.deny, { uuid, ...input }] }));
    },
    [patchRows],
  );

  const removeDeny = useCallback<CatalogDraft["removeDeny"]>(
    (uuid) => {
      patchRows((cur) => ({ ...cur, deny: cur.deny.filter((r) => r.uuid !== uuid) }));
    },
    [patchRows],
  );

  const patchStore = useCallback<CatalogDraft["patchStore"]>(
    (uuid, spec) => {
      patchRows((cur) => ({
        ...cur,
        stores: cur.stores.map((r) => (r.uuid === uuid ? { ...r, spec } : r)),
      }));
    },
    [patchRows],
  );

  const addStore = useCallback<CatalogDraft["addStore"]>((spec) => {
    const uuid = `${NEW_ID}${String(++seq.current)}`;
    patchRows((cur) => ({
      ...cur,
      stores: [
        ...cur.stores,
        {
          uuid,
          name: "hot",
          driver: "redis",
          url: "",
          spec,
        },
      ],
    }));
  }, [patchRows]);

  const patchFormat = useCallback<CatalogDraft["patchFormat"]>(
    (uuid, patch) => {
      patchRows((cur) => ({
        ...cur,
        formats: cur.formats.map((r) => (r.uuid === uuid ? { ...r, ...patch } : r)),
      }));
    },
    [patchRows],
  );

  const addFormat = useCallback<CatalogDraft["addFormat"]>(
    (input) => {
      const uuid = `${NEW_ID}${String(++seq.current)}`;
      patchRows((cur) => ({
        ...cur,
        formats: [
          ...cur.formats,
          { uuid, name: input.name, kind: "nginx", fields: [], format: input.format },
        ],
      }));
    },
    [patchRows],
  );

  const removeFormat = useCallback<CatalogDraft["removeFormat"]>(
    (uuid) => {
      patchRows((cur) => ({ ...cur, formats: cur.formats.filter((r) => r.uuid !== uuid) }));
    },
    [patchRows],
  );

  const dirty = useMemo(() => {
    if (base === null || rows === null) {
      return false;
    }
    const gone = <T extends { uuid: string }>(a: T[], b: T[]) =>
      a.some((r) => !b.some((x) => x.uuid === r.uuid));
    if (
      rows.datasets.some((r) => isNew(r.uuid)) ||
      rows.deny.some((r) => isNew(r.uuid)) ||
      rows.stores.some((r) => isNew(r.uuid)) ||
      rows.formats.some((r) => isNew(r.uuid))
    ) {
      return true;
    }
    if (gone(base.deny, rows.deny) || gone(base.formats, rows.formats)) {
      return true;
    }
    for (const row of rows.datasets) {
      const prev = base.datasets.find((r) => r.uuid === row.uuid);
      if (prev !== undefined && datasetUpdateOf(prev, row) !== null) {
        return true;
      }
    }
    const changed = <T extends { uuid: string }>(a: T[], b: T[], body: (r: T) => string) =>
      b.some((row) => {
        const prev = a.find((r) => r.uuid === row.uuid);
        return prev !== undefined && body(prev) !== body(row);
      });
    return (
      changed(base.deny, rows.deny, denyBody) ||
      changed(base.stores, rows.stores, storeBody) ||
      changed(base.formats, rows.formats, formatBody)
    );
  }, [base, rows]);

  const save = useCallback(async () => {
    if (scope === null || base === null || rows === null || saving) {
      return;
    }
    setSaving(true);
    setError(null);

    const nextBase = copySnap(base);
    const nextRows = copySnap(rows);
    const nextSeeds = { ...seeds };
    const replace = <T extends { uuid: string }>(list: T[], uuid: string, saved: T) =>
      list.map((r) => (r.uuid === uuid ? saved : r));
    let failed: string | null = null;

    try {
      for (const prev of base.deny) {
        if (!rows.deny.some((r) => r.uuid === prev.uuid)) {
          await deleteDenyResponse(scope, prev.uuid);
          nextBase.deny = nextBase.deny.filter((r) => r.uuid !== prev.uuid);
        }
      }
      for (const prev of base.formats) {
        if (!rows.formats.some((r) => r.uuid === prev.uuid)) {
          await deleteLogFormat(scope, prev.uuid);
          nextBase.formats = nextBase.formats.filter((r) => r.uuid !== prev.uuid);
        }
      }

      for (const row of rows.datasets) {
        const prev = base.datasets.find((r) => r.uuid === row.uuid);
        const body = prev === undefined ? null : datasetUpdateOf(prev, row);
        if (body !== null) {
          const saved = await updateDataset(scope, row.uuid, body);
          nextBase.datasets = replace(nextBase.datasets, row.uuid, saved);
          nextRows.datasets = replace(nextRows.datasets, row.uuid, saved);
        }
      }
      for (const row of rows.deny) {
        const prev = base.deny.find((r) => r.uuid === row.uuid);
        if (prev !== undefined && denyBody(prev) !== denyBody(row)) {
          const saved = await saveDenyResponse(scope, row.uuid, {
            name: row.name,
            type: row.type,
            spec: row.spec,
          });
          nextBase.deny = replace(nextBase.deny, row.uuid, saved);
          nextRows.deny = replace(nextRows.deny, row.uuid, saved);
        }
      }
      for (const row of rows.stores) {
        const prev = base.stores.find((r) => r.uuid === row.uuid);
        if (prev !== undefined && storeBody(prev) !== storeBody(row)) {
          const saved = await saveBodyStore(scope, row.uuid, { name: row.name, spec: row.spec });
          nextBase.stores = replace(nextBase.stores, row.uuid, saved);
          nextRows.stores = replace(nextRows.stores, row.uuid, saved);
        }
      }
      for (const row of rows.formats) {
        const prev = base.formats.find((r) => r.uuid === row.uuid);
        if (prev !== undefined && formatBody(prev) !== formatBody(row)) {
          const saved = await saveLogFormat(scope, row.uuid, {
            name: row.name,
            kind: "nginx",
            fields: [],
            format: row.format,
          });
          nextBase.formats = replace(nextBase.formats, row.uuid, saved);
          nextRows.formats = replace(nextRows.formats, row.uuid, saved);
        }
      }

      for (const row of rows.datasets.filter((r) => isNew(r.uuid))) {
        const seed = seeds[row.uuid];
        const saved = await createDataset(scope, {
          name: row.name,
          kind: "list",
          type: row.type,
          mode: row.active ? "active" : "internal",
          limit: row.max_entries,
          ttl: row.active && row.ttl !== undefined && row.ttl !== null ? row.ttl : undefined,
          hash: row.type === "string" ? row.hash === true : undefined,
          in_nginx: true,
          copy_from: seed?.copyFrom,
        });
        nextRows.datasets = replace(nextRows.datasets, row.uuid, saved);
        nextBase.datasets = [...nextBase.datasets, saved];
        delete nextSeeds[row.uuid];
      }
      for (const row of rows.deny.filter((r) => isNew(r.uuid))) {
        const saved = await saveDenyResponse(scope, null, {
          name: row.name,
          type: row.type,
          spec: row.spec,
        });
        nextRows.deny = replace(nextRows.deny, row.uuid, saved);
        nextBase.deny = [...nextBase.deny, saved];
      }
      for (const row of rows.stores.filter((r) => isNew(r.uuid))) {
        const saved = await saveBodyStore(scope, null, { name: row.name, spec: row.spec });
        nextRows.stores = replace(nextRows.stores, row.uuid, saved);
        nextBase.stores = [...nextBase.stores, saved];
      }
      for (const row of rows.formats.filter((r) => isNew(r.uuid))) {
        const saved = await saveLogFormat(scope, null, {
          name: row.name,
          kind: "nginx",
          fields: [],
          format: row.format,
        });
        nextRows.formats = replace(nextRows.formats, row.uuid, saved);
        nextBase.formats = [...nextBase.formats, saved];
      }
    } catch (err) {
      failed = messageOf(err);
    }

    if (failed === null) {
      await load();
    } else {
      setBase(nextBase);
      setRows(nextRows);
      setSeeds(nextSeeds);
      setError(failed);
    }
    setSaving(false);
  }, [scope, base, rows, seeds, saving, load]);

  const reset = useCallback(() => {
    setRows(base === null ? null : copySnap(base));
    setSeeds({});
    setError(null);
  }, [base]);

  const lists = useMemo(
    () => (rows?.datasets ?? []).filter((r) => r.kind === "list"),
    [rows],
  );
  const pages = useMemo(
    () => (rows?.datasets ?? []).filter((r) => r.kind === "content"),
    [rows],
  );

  return {
    loaded: rows !== null,
    lists,
    pages,
    deny: rows?.deny ?? [],
    stores: rows?.stores ?? [],
    formats: rows?.formats ?? [],
    error,
    dirty,
    saving,
    patchList,
    addList,
    patchDeny,
    addDeny,
    removeDeny,
    patchStore,
    addStore,
    patchFormat,
    addFormat,
    removeFormat,
    save,
    reset,
  };
}
