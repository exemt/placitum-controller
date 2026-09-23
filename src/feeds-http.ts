import { Router } from "express";
import type { Request, Response } from "express";

import { parseDatasetEntries } from "./dataset-entry.ts";
import { FeedsError, type FeedCatalog, type FeedMeta, type FeedsClient } from "./feeds.ts";
import { sendWriteError } from "./http-error.ts";
import type { LicenseService } from "./license.ts";
import { log } from "./log.ts";
import type { Dataset, DatasetSource } from "./model/http-space.ts";
import { scopeOf } from "./scope.ts";
import { selectDatasetsInSpace } from "./state/slices/datasets.ts";
import { addAddresses, createDataset, replaceAddresses, setSource } from "./state/thunks/datasets.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const DEFAULT_MAX_ENTRIES = 1_000_000;

/** A set in the panel's eyes: the server's meta plus what this space made of it. */
interface FeedView extends FeedMeta {
  installed: { uuid: string; name: string; version: number; fetched_at: string } | null;
  update: boolean;
}

function installedOf(rows: Dataset[], feedId: string): Dataset | undefined {
  return rows.find((row) => row.source?.feed === feedId);
}

function viewOf(catalog: FeedCatalog, rows: Dataset[], license: LicenseService) {
  const feeds: FeedView[] = catalog.feeds.map((meta) => {
    const row = installedOf(rows, meta.id);
    const source = row?.source;

    return {
      ...meta,
      installed:
        row === undefined || source === undefined
          ? null
          : { uuid: row.id, name: row.name, version: source.version, fetched_at: source.fetched_at },
      update: source !== undefined && source.version < meta.version,
    };
  });

  return {
    license: license.state(),
    checked_at: catalog.checked_at,
    error: catalog.error,
    updates: feeds.filter((f) => f.update).length,
    feeds,
  };
}

/** A dataset name from a set id: the set "known-bots" becomes the list "known_bots". */
export function datasetNameOf(feedId: string, taken: ReadonlySet<string>): string {
  const base = feedId.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "feed";

  if (!taken.has(base)) {
    return base;
  }

  for (let n = 2; ; n += 1) {
    const name = `${base}_${n}`;

    if (!taken.has(name)) {
      return name;
    }
  }
}

function sendFeedsError(err: unknown, res: Response, next: (err: unknown) => void): void {
  if (err instanceof FeedsError) {
    res.status(err.status).json({ error: err.code });
    return;
  }

  sendWriteError(err, res, next);
}

/*
 * The sets of the license server in a space: the catalog with what is
 * installed and what has a newer version, and the two actions: download a
 * set as a new list, refresh a list from its set.
 */
export function feedsRouter(
  feeds: FeedsClient,
  license: LicenseService,
  dispatch: AppDispatch,
  getState: () => RootState,
): Router {
  const router = Router({ mergeParams: true });

  const respond = async (req: Request, res: Response, force: boolean) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const catalog = await feeds.get(force);
    res.json(viewOf(catalog, selectDatasetsInSpace(getState(), scope), license));
  };

  router.get("/", async (req, res, next) => {
    try {
      await respond(req, res, false);
    } catch (err) {
      next(err);
    }
  });

  router.post("/check", async (req, res, next) => {
    try {
      await respond(req, res, true);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/install", async (req, res, next) => {
    try {
      const scope = scopeOf(req);
      const id = req.params.id;

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const rows = selectDatasetsInSpace(getState(), scope);

      if (installedOf(rows, id) !== undefined) {
        res.status(409).json({ error: "already_installed" });
        return;
      }

      const meta = (await feeds.get()).feeds.find((f) => f.id === id);

      if (meta === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = await feeds.fetch(id);
      const parsed = parseDatasetEntries(body.type, body.entries);

      if (!parsed.ok) {
        log("warn", "feed has entries of another type", { feed: id, invalid: parsed.invalid.slice(0, 3) });
        res.status(502).json({ error: "bad_feed" });
        return;
      }

      const wanted = (req.body as { name?: unknown } | undefined)?.name;
      const taken = new Set(rows.map((row) => row.name));
      const name =
        typeof wanted === "string" && wanted.trim() !== "" ? wanted.trim() : datasetNameOf(id, taken);

      const created = await dispatch(
        createDataset({
          httpSpaceId: scope,
          name,
          description: meta.desc_en,
          kind: "list",
          type: body.type,
          maxEntries: Math.max(DEFAULT_MAX_ENTRIES, body.count),
          active: false,
        }),
      ).unwrap();

      if (parsed.entries.length > 0) {
        await dispatch(addAddresses({ datasetId: created.id, addresses: parsed.entries })).unwrap();
      }

      const source: DatasetSource = {
        feed: id,
        version: body.version,
        sha256: body.sha256,
        fetched_at: new Date().toISOString(),
        server: license.serverUrl,
      };
      const dataset = await dispatch(setSource({ id: created.id, source })).unwrap();

      log("info", "feed installed", { feed: id, dataset: dataset.id, name, entries: parsed.entries.length, version: body.version });
      res.status(201).json(viewOf(feeds.current(), selectDatasetsInSpace(getState(), scope), license));
    } catch (err) {
      sendFeedsError(err, res, next);
    }
  });

  router.post("/:id/update", async (req, res, next) => {
    try {
      const scope = scopeOf(req);
      const id = req.params.id;

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = installedOf(selectDatasetsInSpace(getState(), scope), id);

      if (row === undefined || row.source === undefined) {
        res.status(404).json({ error: "not_installed" });
        return;
      }

      if (row.active) {
        res.status(400).json({ error: "active_list" });
        return;
      }

      const body = await feeds.fetch(id);

      if (body.type !== row.type) {
        res.status(502).json({ error: "type_changed" });
        return;
      }

      const parsed = parseDatasetEntries(body.type, body.entries);

      if (!parsed.ok) {
        res.status(502).json({ error: "bad_feed" });
        return;
      }

      if (body.sha256 !== row.source.sha256) {
        await dispatch(replaceAddresses({ datasetId: row.id, addresses: parsed.entries })).unwrap();
      }

      const source: DatasetSource = {
        ...row.source,
        version: body.version,
        sha256: body.sha256,
        fetched_at: new Date().toISOString(),
      };
      await dispatch(setSource({ id: row.id, source })).unwrap();

      log("info", "feed updated", { feed: id, dataset: row.id, entries: parsed.entries.length, version: body.version });
      res.json(viewOf(feeds.current(), selectDatasetsInSpace(getState(), scope), license));
    } catch (err) {
      sendFeedsError(err, res, next);
    }
  });

  return router;
}
