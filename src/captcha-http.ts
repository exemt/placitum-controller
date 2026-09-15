import { Router } from "express";
import type { Request, Response } from "express";

import { buildCaptchaManifest } from "./captcha-manifest.ts";
import {
  DocError,
  normalizeDoc,
  validateDoc,
  validatePage,
} from "./captcha-profile-doc.ts";
import type { CaptchaProfileRepo } from "./captcha-profiles.ts";
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
import type { CaptchaProfile, CaptchaProfileDoc } from "./model/captcha-profile.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { profileUses, usesDetail } from "./usage.ts";

const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function jsonProfile(row: CaptchaProfile) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    server_id: row.serverId,
    name: row.name,
    description: row.description,
    when: row.when,
    provider: row.provider,
    fallback: row.fallback,
    doc: row.doc,
    modified:
      row.name === DEFAULT_PROFILE_NAME &&
      (row.serverId !== null ||
        docDiffersFromBaseline(row.description, row.doc, normalizeDoc)),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function badName(value: unknown): boolean {
  return typeof value !== "string" || !NAME_RE.test(value);
}

export function captchaRouter(
  getState: () => RootState,
  repo: CaptchaProfileRepo,
  desired: DesiredStore,
  settingsOf: InspectorSettingsSource,
): Router {
  const router = Router({ mergeParams: true });

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

  async function checkPaths(
    scope: string,
    serverId: string | null,
    doc: CaptchaProfileDoc,
    res: Response,
  ): Promise<boolean> {
    if (doc.path === "") {
      return true;
    }

    if (serverId === null) {
      res.status(400).json({ error: "server_required" });

      return false;
    }

    const locations = await repo.serverLocations(serverId, scope);

    if (locations === null) {
      res.status(400).json({ error: "unknown_server" });

      return false;
    }

    const addressable = locations.filter(
      (row) => row.match === "prefix" || row.match === "exact",
    );

    if (doc.path !== "") {
      const found = addressable.find((row) => row.path === doc.path);

      if (found === undefined) {
        res.status(400).json({
          error: "unknown_location",
          detail: doc.path,
          locations: addressable.map((row) => row.path),
        });

        return false;
      }
    }

    return true;
  }

  async function checkPage(
    scope: string,
    doc: CaptchaProfileDoc,
    res: Response,
  ): Promise<boolean> {
    if (doc.page === "") {
      return true;
    }

    const page = await repo.page(doc.page, scope);

    if (page === null) {
      res.status(400).json({ error: "unknown_page", detail: doc.page });

      return false;
    }

    if (page.type !== "html") {
      res.status(400).json({ error: "page_not_html", detail: page.name });

      return false;
    }

    try {
      validatePage(page.text);
    } catch (err) {
      res.status(400).json({
        error: "invalid_page",
        detail: err instanceof Error ? err.message : String(err),
      });

      return false;
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
        server_id?: unknown;
        doc?: unknown;
      };

      if (badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = normalizeDoc(body.doc);
      validateDoc(doc);

      const serverId = asUuid(String(body.server_id ?? "")) ?? null;

      if (!(await checkPaths(scope, serverId, doc, res))) {
        return;
      }

      if (!(await checkPage(scope, doc, res))) {
        return;
      }

      const row = await repo.insert({
        httpSpaceId: scope,
        serverId,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "captcha profile created", { uuid: row.id, name: row.name });
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
      const unknownSenders = [
        ...new Set(
          row.doc.trigger.prior
            .map((rule) => rule.from)
            .filter((from) => from !== "*" && !known.has(from)),
        ),
      ];

      const senderCodes = await repo.senderCodes(row.httpSpaceId);

      res.json({
        ...jsonProfile(row),
        unknown_senders: unknownSenders,
        sender_codes: senderCodes,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        server_id?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      if (isDefaultRename(existing.name, body.name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      let doc = undefined;

      if (body.doc !== undefined) {
        doc = normalizeDoc(body.doc);
        validateDoc(doc);
      }

      const serverId =
        body.server_id === undefined
          ? existing.serverId
          : (asUuid(String(body.server_id ?? "")) ?? null);

      if (
        (doc !== undefined || body.server_id !== undefined) &&
        !(await checkPaths(existing.httpSpaceId, serverId, doc ?? existing.doc, res))
      ) {
        return;
      }

      if (doc !== undefined && !(await checkPage(existing.httpSpaceId, doc, res))) {
        return;
      }

      const row = await repo.update(existing.id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        serverId: body.server_id === undefined ? undefined : serverId,
        doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "captcha profile updated", { uuid: row.id, name: row.name });
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
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      if (existing.name !== DEFAULT_PROFILE_NAME) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const doc = normalizeDoc(DEFAULT_DOC_BASELINE.doc);
      validateDoc(doc);

      const row = await repo.update(existing.id, {
        description: DEFAULT_DOC_BASELINE.description,
        serverId: null,
        doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "captcha profile restored", { uuid: row.id, name: row.name });
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
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      if (existing.name === "default") {
        res.status(409).json({ error: "default_required" });
        return;
      }

      const uses = profileUses(
        getState(),
        existing.httpSpaceId,
        "captcha",
        existing.name,
      );

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      await repo.remove(existing.id);
      log("info", "captcha profile removed", { uuid: existing.id, name: existing.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const manifest = await desired.getCaptcha();

      if (manifest === null) {
        res.status(404).json({ error: "not_found" });
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

      const current = await desired.getCaptcha();
      const built = await buildCaptchaManifest(repo, scope, (current?.rev ?? 0) + 1, settingsOf);

      if ("error" in built) {
        res.status(400).json(built);
        return;
      }

      await desired.putCaptcha(built.manifest);

      log("info", "captcha sent", {
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

  async function owned(req: Request, res: Response): Promise<CaptchaProfile | null> {
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
