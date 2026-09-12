import { Router } from "express";
import type { Request, Response } from "express";

import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import { isStoreType } from "./model/store.ts";
import type { StoreRepo } from "./store.ts";

function jsonMeta(meta: {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  size: number;
  createdAt: Date;
}) {
  return {
    uuid: meta.id,
    type: meta.type,
    metadata: meta.metadata,
    size: meta.size,
    created_at: meta.createdAt.toISOString(),
  };
}

export function storeRouter(repo: StoreRepo, maxBytes: number): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (_req, res, next) => {
    try {
      const objects = await repo.list();
      res.json({ objects: objects.map(jsonMeta) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as {
        type?: unknown;
        metadata?: unknown;
        blob?: unknown;
      };

      if (typeof body.type !== "string" || !isStoreType(body.type)) {
        res.status(400).json({ error: "invalid_type" });
        return;
      }

      if (typeof body.blob !== "string" || body.blob.length === 0) {
        res.status(400).json({ error: "blob_required" });
        return;
      }

      let blob: Buffer;

      try {
        blob = Buffer.from(body.blob, "base64");
      } catch {
        res.status(400).json({ error: "blob_not_base64" });
        return;
      }

      // Buffer.from на мусоре не бросает -- пустой или усечённый результат.
      if (blob.length === 0) {
        res.status(400).json({ error: "blob_empty" });
        return;
      }

      if (blob.length > maxBytes) {
        res.status(413).json({ error: "blob_too_large", max: maxBytes });
        return;
      }

      const metadata =
        body.metadata !== null &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {};

      const meta = await repo.insert(body.type, metadata, blob);

      log("info", "store object created", {
        uuid: meta.id,
        type: meta.type,
        size: meta.size,
      });

      res.status(201).json(jsonMeta(meta));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid/meta", async (req, res, next) => {
    try {
      const id = asUuid(req.params.uuid);

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const meta = await repo.getMeta(id);

      if (meta === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonMeta(meta));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid/blob", async (req, res, next) => {
    try {
      const id = asUuid(req.params.uuid);

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const obj = await repo.get(id);

      if (obj === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.setHeader("X-Store-Type", obj.type);
      res.setHeader("X-Store-Uuid", obj.id);
      res.type("application/octet-stream").send(obj.blob);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid", async (req, res, next) => {
    try {
      const id = asUuid(req.params.uuid);

      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const obj = await repo.get(id);

      if (obj === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json({
        ...jsonMeta({
          id: obj.id,
          type: obj.type,
          metadata: obj.metadata,
          size: obj.blob.length,
          createdAt: obj.createdAt,
        }),
        blob: obj.blob.toString("base64"),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
