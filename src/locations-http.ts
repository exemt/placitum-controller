import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { jsonRouteInheritance } from "./inheritance.ts";
import { log } from "./log.ts";
import type { LocationView } from "./locations.ts";
import { asUuid } from "./model/id.ts";
import { scopeOf } from "./scope.ts";
import {
  locationSelectors,
  selectLocationsInSpace,
} from "./state/slices/locations.ts";
import { serverSelectors } from "./state/slices/servers.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import { deleteLocation, updateLocation } from "./state/thunks/locations.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import { parseLocationPatch } from "./servers-parse.ts";
import { upstreamInScope } from "./upstreams-http.ts";

export function jsonLocation(row: LocationView) {
  return {
    uuid: row.id,
    server_id: row.serverId,
    server_name: row.serverName,
    http_space_id: row.httpSpaceId,
    match: row.match,
    path: row.path,
    position: row.position,
    enabled: row.enabled,
    handler: row.handler,
    protocol: row.protocol,
    upstream_id: row.upstreamId ?? null,
    upstream_uri: row.upstreamUri ?? null,
    return_status: row.returnStatus ?? null,
    return_page: row.returnPage ?? null,
    return_url: row.returnUrl ?? null,
    static_file: row.staticFile ?? null,
    nginx: row.nginx,
    waf: row.waf,
    raw: row.raw,
    raw_nginx: row.rawNginx,
    builtin: row.builtin,
  };
}

function locationInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): LocationView | undefined {
  const row = locationSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}

export function locationsRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const serverId =
      typeof req.query.server === "string" ? asUuid(req.query.server) : undefined;
    if (typeof req.query.server === "string" && serverId === undefined) {
      res.status(400).json({ error: "invalid_server" });
      return;
    }

    if (serverId !== undefined) {
      const server = serverSelectors.selectById(getState(), serverId);
      if (server === undefined || server.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }
    }

    const rows = selectLocationsInSpace(getState(), scope).filter((row) =>
      serverId === undefined ? true : row.serverId === serverId,
    );

    res.json({ locations: rows.map(jsonLocation) });
  });

  router.get("/:uuid", (req, res) => {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }
    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return;
    }

    const row = locationInScope(getState, id, scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonLocation(row));
  });

  router.get("/:uuid/inheritance", (req, res) => {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }
    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return;
    }

    const location = locationInScope(getState, id, scope);
    if (location === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const server = serverSelectors.selectById(getState(), location.serverId);
    const space = spaceSelectors.selectById(getState(), scope);
    if (server === undefined || space === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonRouteInheritance(space, server));
  });

  router.put("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      const current = locationInScope(getState, id, scope);
      if (current === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const parsed = parseLocationPatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      if (
        current.builtin &&
        ((parsed.value.match !== undefined && parsed.value.match !== current.match) ||
          (parsed.value.path !== undefined && parsed.value.path !== current.path))
      ) {
        res.status(400).json({ error: "builtin_name_locked" });
        return;
      }
      if (
        parsed.value.upstreamId !== undefined &&
        parsed.value.upstreamId !== null &&
        upstreamInScope(getState, parsed.value.upstreamId, scope) === undefined
      ) {
        res.status(400).json({ error: "unknown_upstream" });
        return;
      }

      const row = await dispatch(updateLocation({ id, patch: parsed.value })).unwrap();
      log("info", "location updated", { uuid: row.id, path: row.path });
      res.json(jsonLocation(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      const current = locationInScope(getState, id, scope);
      if (current === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (current.builtin) {
        res.status(400).json({ error: "builtin_locked" });
        return;
      }

      const row = await dispatch(deleteLocation({ id })).unwrap();
      log("info", "location deleted", { uuid: row.id, path: row.path });
      res.json(jsonLocation(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
