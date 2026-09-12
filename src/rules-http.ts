import { Router } from "express";
import type { Request, Response } from "express";

import type { RulesCompiler } from "./compile.ts";
import type { DesiredStore } from "./desired.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { jsonSendPack } from "./compile/pointer.ts";
import { scopeOf } from "./scope.ts";

export function rulesRouter(
  desired: DesiredStore,
  compiler: RulesCompiler,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await desired.getRulesPack();

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonSendPack(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/send", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const out = await compiler.compile(spaceId);

      if (out.pointer === null) {
        res.status(503).json({ error: "kv_unavailable" });
        return;
      }

      log("info", "rules sent", {
        space: spaceId,
        rev: out.pointer.rev,
        hash: out.pointer.sha256,
        blobs: out.pointer.blobs,
        wrote: out.pointer.wrote,
        reused: out.pointer.reused,
        profiles: Object.keys(out.pointer.profiles),
      });

      res.json(jsonSendPack(out.pointer));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/pack", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await desired.getRulesPack();

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(row);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/compile", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const out = await compiler.compile(spaceId);

      log("info", "rules compiled", {
        space: spaceId,
        root: out.root,
        files: out.files,
        profiles: out.profiles,
        sha256: out.sha256,
        blobs: out.pointer?.blobs,
        wrote: out.pointer?.wrote,
        reused: out.pointer?.reused,
        rev: out.pointer?.rev,
      });

      res.json({
        root: out.root,
        files: out.files,
        profiles: out.profiles,
        files_dir: out.filesDir,
        profiles_dir: out.profilesDir,
        sha256: out.sha256,
        prefix: out.pointer?.prefix ?? null,
        blobs: out.pointer?.blobs ?? null,
        wrote: out.pointer?.wrote ?? null,
        reused: out.pointer?.reused ?? null,
        bytes: out.pointer?.bytes ?? null,
        rev: out.pointer?.rev ?? null,
      });
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
