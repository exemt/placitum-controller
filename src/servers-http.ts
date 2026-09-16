import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { jsonRouteInheritance } from "./inheritance.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { Server } from "./model/server.ts";
import { scopeOf } from "./scope.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import {
  selectLocationsOnServer,
  selectLocationsInSpace,
} from "./state/slices/locations.ts";
import {
  selectServersInSpace,
  serverSelectors,
} from "./state/slices/servers.ts";
import { createServer, deleteServer, updateServer } from "./state/thunks/servers.ts";
import { createLocation, reorderLocations } from "./state/thunks/locations.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import { parseLocationCreate, parseServerCreate, parseServerPatch } from "./servers-parse.ts";
import { jsonLocation } from "./locations-http.ts";
import { mountServerCertificateRoutes } from "./certificates-http.ts";
import { jsonBind, mountServerPortRoutes } from "./ports-http.ts";
import { selectBindsOnServer } from "./state/slices/ports.ts";
import type { PortBind } from "./ports.ts";
import { upstreamInScope } from "./upstreams-http.ts";

export function jsonServer(
  row: Server,
  locationCount?: number,
  listens?: PortBind[],
) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    server_names: row.serverNames,
    enabled: row.enabled,
    nginx: row.nginx,
    waf: row.waf,
    raw: row.raw,
    raw_nginx: row.rawNginx,
    location_count: locationCount ?? 0,
    listen_count: listens?.length ?? 0,
    listens: (listens ?? []).map(jsonBind),
  };
}

function serverInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): Server | undefined {
  const row = serverSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}

export function serversRouter(
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

    const locations = selectLocationsInSpace(getState(), scope);
    res.json({
      servers: selectServersInSpace(getState(), scope).map((row) =>
        jsonServer(
          row,
          locations.filter((loc) => loc.serverId === row.id).length,
          selectBindsOnServer(getState(), row.id),
        ),
      ),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);
      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const parsed = parseServerCreate(req.body, spaceId);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const { server: row, locations } = await dispatch(createServer(parsed.value)).unwrap();
      log("info", "server created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonServer(row, locations.length, []));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/:uuid/locations", (req, res) => {
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
    if (serverInScope(getState, id, scope) === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json({
      locations: selectLocationsOnServer(getState(), id).map(jsonLocation),
    });
  });

  router.put("/:uuid/locations/order", async (req: Request, res: Response, next) => {
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
      if (serverInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const order = parseOrder(req.body);
      if (order === undefined) {
        res.status(400).json({ error: "invalid_order" });
        return;
      }

      const rows = await dispatch(reorderLocations({ serverId: id, ids: order })).unwrap();
      log("info", "locations reordered", { server: id, count: rows.length });
      res.json({ locations: rows.map(jsonLocation) });
    } catch (err) {
      sendWriteError(err, res, next);
    }
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

    const server = serverInScope(getState, id, scope);
    if (server === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const space = spaceSelectors.selectById(getState(), scope);
    if (space === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonRouteInheritance(space, server));
  });

  router.post("/:uuid/locations", async (req: Request, res: Response, next) => {
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
      if (serverInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const parsed = parseLocationCreate(req.body, id);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      if (
        parsed.value.upstreamId !== undefined &&
        upstreamInScope(getState, parsed.value.upstreamId, scope) === undefined
      ) {
        res.status(400).json({ error: "unknown_upstream" });
        return;
      }

      const row = await dispatch(createLocation(parsed.value)).unwrap();
      log("info", "location created", { uuid: row.id, path: row.path });
      res.status(201).json(jsonLocation(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
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

    const row = serverInScope(getState, id, scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(
      jsonServer(
        row,
        selectLocationsOnServer(getState(), id).length,
        selectBindsOnServer(getState(), id),
      ),
    );
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
      if (serverInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const parsed = parseServerPatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const row = await dispatch(updateServer({ id, patch: parsed.value })).unwrap();
      log("info", "server updated", { uuid: row.id, name: row.name });
      res.json(
        jsonServer(
          row,
          selectLocationsOnServer(getState(), id).length,
          selectBindsOnServer(getState(), id),
        ),
      );
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
      if (serverInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await dispatch(deleteServer({ id })).unwrap();
      log("info", "server deleted", { uuid: row.id, name: row.name });
      res.json(jsonServer(row, 0, []));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  mountServerPortRoutes(router, dispatch, getState, (id, scope) =>
    serverInScope(getState, id, scope),
  );
  mountServerCertificateRoutes(router, dispatch, getState, (id, scope) =>
    serverInScope(getState, id, scope),
  );

  return router;
}

function parseOrder(body: unknown): string[] | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const order = (body as { order?: unknown }).order;
  if (!Array.isArray(order)) {
    return undefined;
  }
  const ids: string[] = [];
  for (const item of order) {
    const id = typeof item === "string" ? asUuid(item) : undefined;
    if (id === undefined || ids.includes(id)) {
      return undefined;
    }
    ids.push(id);
  }
  return ids;
}
