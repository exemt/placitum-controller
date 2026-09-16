import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import {
  parseAsns,
  parseCountries,
  parseIds,
  parseName,
  parseText,
} from "./ip-parse.ts";
import type { IpSetMatchInput, IpSetRepo } from "./ip-sets.ts";
import { emptyMatchInput } from "./ip-sets.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { IpSet, IpSetMatch, IpSetMeta } from "./model/ip-profile.ts";
import { scopeOf } from "./scope.ts";

function jsonMeta(row: IpSetMeta) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    list_count: row.lists,
    live: row.live,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function jsonMatch(match: IpSetMatch) {
  return {
    lists: match.lists.map((list) => ({
      uuid: list.datasetId,
      name: list.name,
      type: list.type,
      active: list.active,
    })),
    countries: match.countries,
    asns: match.asns,
  };
}

function jsonSet(row: IpSet) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    inverse: row.inverse,
    ...jsonMatch(row),
    exclude: jsonMatch(row.exclude),
    live: row.lists.some((list) => list.active),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function parseMatch(value: unknown): IpSetMatchInput | "bad" {
  if (value === undefined || value === null) {
    return emptyMatchInput();
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return "bad";
  }

  const row = value as {
    lists?: unknown;
    countries?: unknown;
    asns?: unknown;
  };

  const lists = parseIds(row.lists ?? []);
  const countries =
    row.countries === undefined ? [] : parseCountries(row.countries);
  const asns = row.asns === undefined ? [] : parseAsns(row.asns);

  if (lists === "bad" || countries === "bad" || asns === "bad") {
    return "bad";
  }

  return { lists, countries, asns };
}

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

export function ipSetsRouter(repo: IpSetRepo): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        badRequest(res, "invalid_scope");
        return;
      }

      res.json({ ip_sets: (await repo.list(scope)).map(jsonMeta) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        badRequest(res, "invalid_scope");
        return;
      }

      if (id === undefined) {
        badRequest(res, "invalid_uuid");
        return;
      }

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonSet(row));
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        badRequest(res, "invalid_scope");
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        inverse?: unknown;
        lists?: unknown;
        countries?: unknown;
        asns?: unknown;
        exclude?: unknown;
      };

      const name = parseName(body.name);

      if (name === undefined || name === "bad") {
        badRequest(res, "invalid_name");
        return;
      }

      const description = parseText(body.description) ?? "";

      if (description === "bad") {
        badRequest(res, "invalid_description");
        return;
      }

      const match = parseMatch({
        lists: body.lists,
        countries: body.countries,
        asns: body.asns,
      });
      const exclude = parseMatch(body.exclude);

      if (match === "bad" || exclude === "bad") {
        badRequest(res, "invalid_set");
        return;
      }

      const row = await repo.insert({
        httpSpaceId: scope,
        name,
        description,
        inverse: body.inverse === true,
        match,
        exclude,
      });

      if (typeof row === "string") {
        badRequest(res, row);
        return;
      }

      log("info", "ip set created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonSet(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.put("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        badRequest(res, "invalid_scope");
        return;
      }

      if (id === undefined) {
        badRequest(res, "invalid_uuid");
        return;
      }

      const current = await repo.get(id);

      if (current === null || current.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        inverse?: unknown;
        lists?: unknown;
        countries?: unknown;
        asns?: unknown;
        exclude?: unknown;
      };

      const name = parseName(body.name);
      const description = parseText(body.description);

      if (name === "bad") {
        badRequest(res, "invalid_name");
        return;
      }

      if (description === "bad") {
        badRequest(res, "invalid_description");
        return;
      }

      const match =
        body.lists === undefined &&
        body.countries === undefined &&
        body.asns === undefined
          ? undefined
          : parseMatch({
              lists: body.lists,
              countries: body.countries,
              asns: body.asns,
            });
      const exclude =
        body.exclude === undefined ? undefined : parseMatch(body.exclude);

      if (match === "bad" || exclude === "bad") {
        badRequest(res, "invalid_set");
        return;
      }

      const row = await repo.update(id, {
        name,
        description,
        inverse: body.inverse === undefined ? undefined : body.inverse === true,
        match,
        exclude,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (typeof row === "string") {
        badRequest(res, row);
        return;
      }

      log("info", "ip set updated", { uuid: row.id, name: row.name });
      res.json(jsonSet(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        badRequest(res, "invalid_scope");
        return;
      }

      if (id === undefined) {
        badRequest(res, "invalid_uuid");
        return;
      }

      const current = await repo.get(id);

      if (current === null || current.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const done = await repo.remove(id);

      if (done === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (done === "in_use") {
        res.status(409).json({ error: "in_use" });
        return;
      }

      log("info", "ip set deleted", { uuid: id, name: current.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
