import { Router } from "express";
import type { Request, Response } from "express";

import { buildCounterManifest, SHARED_PROFILE } from "./counter-manifest.ts";
import {
  checkReferences,
  DocError,
  normalizeDoc,
  normalizeShared,
  validateDoc,
  validateShared,
} from "./counter-profile-doc.ts";
import type { CounterProfileRepo } from "./counter-profiles.ts";
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
import type { CounterProfile, CounterProfileDoc } from "./model/counter-profile.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { profileUses, usesDetail } from "./usage.ts";

const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

function counterProfile(row: CounterProfile) {
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

export function counterRouter(
  getState: () => RootState,
  repo: CounterProfileRepo,
  desired: DesiredStore,
  settingsOf: InspectorSettingsSource,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/shared", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ shared: await repo.shared(scope) });
    } catch (err) {
      next(err);
    }
  });

  router.put("/shared", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as { shared?: unknown };
      const shared = validateShared(normalizeShared(body.shared));

      for (const row of await repo.list(scope)) {
        try {
          checkReferences(row.doc, shared);
        } catch (err) {
          res.status(400).json({
            error: "profile_reference_broken",
            profile: row.name,
            detail: err instanceof Error ? err.message : String(err),
          });

          return;
        }
      }

      await repo.putShared(scope, shared);

      log("info", "counter shared updated", {
        space: scope,
        counters: Object.keys(shared.counters),
      });

      res.json({ shared });
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_shared", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.get("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ profiles: (await repo.list(scope)).map(counterProfile) });
    } catch (err) {
      next(err);
    }
  });

  async function checkDoc(
    scope: string,
    doc: CounterProfileDoc,
    res: Response,
  ): Promise<boolean> {
    try {
      checkReferences(doc, await repo.shared(scope));
    } catch (err) {
      res.status(400).json({
        error: "counter_unknown",
        detail: err instanceof Error ? err.message : String(err),
      });

      return false;
    }

    const denies = doc.request.judge.some((rule) => rule.action === "deny");

    if (denies && doc.request.enabled && doc.request.denyResponse !== "") {
      const known = new Set(await repo.denyResponses(scope));

      if (!known.has(doc.request.denyResponse)) {
        res.status(400).json({
          error: "deny_response_unknown",
          detail: doc.request.denyResponse,
          known: [...known],
        });

        return false;
      }
    }

    return true;
  }

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

      if (badName(body.name) || body.name === SHARED_PROFILE) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = validateDoc(normalizeDoc(body.doc));

      if (!(await checkDoc(scope, doc, res))) {
        return;
      }

      const row = await repo.insert({
        httpSpaceId: scope,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "counter profile created", { uuid: row.id, name: row.name });
      res.status(201).json(counterProfile(row));
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
      const unknownSenders = [
        ...new Set(
          row.doc.trigger.prior
            .map((rule) => rule.from)
            .filter((from) => from !== "*" && !known.has(from)),
        ),
      ];

      const senderCodes = await repo.senderCodes(row.httpSpaceId);

      res.json({
        ...counterProfile(row),
        unknown_senders: unknownSenders,
        sender_codes: senderCodes,
      });
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

      const scope = current.httpSpaceId;

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && (badName(body.name) || body.name === SHARED_PROFILE)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      if (isDefaultRename(current.name, body.name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      const doc =
        body.doc === undefined ? current.doc : validateDoc(normalizeDoc(body.doc));

      if (!(await checkDoc(scope, doc, res))) {
        return;
      }

      const row = await repo.update(current.id, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        doc: body.doc === undefined ? undefined : doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "counter profile updated", { uuid: row.id, name: row.name });
      res.json(counterProfile(row));
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

      log("info", "counter profile restored", { uuid: row.id, name: row.name });
      res.json(counterProfile(row));
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

      const uses = profileUses(getState(), row.httpSpaceId, "counter", row.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      if (!(await repo.remove(row.id))) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "counter profile deleted", { uuid: row.id, name: row.name });
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

      const manifest = await desired.getCounter();

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

      const current = await desired.getCounter();
      const built = await buildCounterManifest(repo, scope, (current?.rev ?? 0) + 1, settingsOf);

      if ("error" in built) {
        res.status(400).json(built);
        return;
      }

      await desired.putCounter(built.manifest);

      log("info", "counter sent", {
        space: scope,
        rev: built.manifest.rev,
        hash: built.manifest.config_hash,
        profiles: Object.keys(built.manifest.profiles),
      });

      res.json(built.manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  async function owned(req: Request, res: Response): Promise<CounterProfile | null> {
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
