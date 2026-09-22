import { Router } from "express";
import type { Request, Response } from "express";

import { BLOB_TTL_SEC } from "./compile/pointer.ts";
import { cookieListsOf, buildCookieManifest } from "./cookie-manifest.ts";
import { DocError, normalizeDoc, validateDoc } from "./cookie-profile-doc.ts";
import type { CookieProfileRepo } from "./cookie-profiles.ts";
import type { DatasetRepo } from "./datasets.ts";
import {
  DEFAULT_DOC_BASELINE,
  DEFAULT_PROFILE_NAME,
  docDiffersFromBaseline,
  isDefaultRename,
} from "./default-profile.ts";
import type { DesiredStore } from "./desired.ts";
import type { InspectorSettingsSource } from "./inspector-settings.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { CookieProfile } from "./model/cookie-profile.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { profileUses, usesDetail } from "./usage.ts";

const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

function jsonProfile(row: CookieProfile) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    doc: row.doc,
    modified:
      row.name === DEFAULT_PROFILE_NAME &&
      docDiffersFromBaseline(row.description, row.doc, normalizeDoc),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function badName(value: unknown): boolean {
  return typeof value !== "string" || !NAME_RE.test(value);
}

/* Where the bodies of static lists go before the generation that names them: the internal Redis. */
export interface CookieBlobWriter {
  setNxExpireMany(
    items: { key: string; value: Buffer }[],
    ttlSec: number,
  ): Promise<{ wrote: number; reused: number }>;
}

export function cookieProfilesRouter(
  getState: () => RootState,
  repo: CookieProfileRepo,
  desired: DesiredStore,
  settingsOf: InspectorSettingsSource,
  datasets: DatasetRepo,
  blobs: CookieBlobWriter | null = null,
): Router {
  const router = Router({ mergeParams: true });

  const listsOf = cookieListsOf(datasets);
  const datasetsOf = (scope: string) => listsOf.catalog(scope);

  router.get("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ profiles: (await repo.list(scope)).map(jsonProfile) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = validateDoc(normalizeDoc(body.doc), await datasetsOf(scope));

      const row = await repo.insert({
        httpSpaceId: scope,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "cookie profile created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.get("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await owned(req, res);

      if (row === null) {
        return;
      }

      const known = new Set(await repo.inspectorNames(row.httpSpaceId));
      const unknownTargets = [
        ...new Set(
          row.doc.rules
            .flatMap((rule) => rule.actions.map((ask) => ask.to))
            .filter((to) => to !== "" && !known.has(to)),
        ),
      ];

      res.json({ ...jsonProfile(row), unknown_targets: unknownTargets });
    } catch (err) {
      next(err);
    }
  });

  router.put("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const current = await owned(req, res);

      if (current === null) {
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      if (isDefaultRename(current.name, body.name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      const doc =
        body.doc === undefined
          ? current.doc
          : validateDoc(normalizeDoc(body.doc), await datasetsOf(current.httpSpaceId));

      const row = await repo.update(current.id, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        doc: body.doc === undefined ? undefined : doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "cookie profile updated", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.post("/profiles/:uuid/restore", async (req: Request, res: Response, next) => {
    try {
      const current = await owned(req, res);

      if (current === null) {
        return;
      }

      if (current.name !== DEFAULT_PROFILE_NAME) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const row = await repo.update(current.id, {
        description: DEFAULT_DOC_BASELINE.description,
        doc: validateDoc(normalizeDoc(DEFAULT_DOC_BASELINE.doc)),
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "cookie profile restored", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.delete("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await owned(req, res);

      if (row === null) {
        return;
      }

      if (row.name === "default") {
        res.status(400).json({ error: "default_is_required" });
        return;
      }

      const uses = profileUses(getState(), row.httpSpaceId, "cookie", row.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      if (!(await repo.remove(row.id))) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "cookie profile deleted", { uuid: row.id, name: row.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const manifest = await desired.getCookie();

      if (manifest === null) {
        res.status(404).json({ error: "not_published" });
        return;
      }

      res.json(manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/send", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const current = await desired.getCookie();
      const built = await buildCookieManifest(
        repo,
        scope,
        (current?.rev ?? 0) + 1,
        settingsOf,
        listsOf,
      );

      if ("error" in built) {
        res.status(400).json(built);
        return;
      }

      // The bodies go first: the inspector reads them as soon as the generation names them.
      if (built.blobs.length > 0) {
        if (blobs === null) {
          res.status(503).json({
            error: "blobs_unavailable",
            detail: "static lists travel through the internal Redis, and it is not configured",
          });
          return;
        }

        try {
          await blobs.setNxExpireMany(built.blobs, BLOB_TTL_SEC);
        } catch (err) {
          log("warn", "cookie lists not stored", {
            space: scope,
            error: err instanceof Error ? err.message : String(err),
          });
          res.status(503).json({ error: "blobs_unavailable", detail: "the internal Redis did not take the lists" });
          return;
        }
      }

      await desired.putCookie(built.manifest);

      log("info", "cookie sent", {
        space: scope,
        rev: built.manifest.rev,
        hash: built.manifest.config_hash,
        profiles: Object.keys(built.manifest.profiles),
        lists: Object.keys(built.manifest.lists ?? {}),
      });

      res.json(built.manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  async function owned(req: Request, res: Response): Promise<CookieProfile | null> {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return null;
    }

    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return null;
    }

    const row = await repo.get(id);

    if (row === null || row.httpSpaceId !== scope) {
      res.status(404).json({ error: "not_found" });
      return null;
    }

    return row;
  }

  return router;
}
