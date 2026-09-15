import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { Port } from "./model/listen.ts";
import type { PortBind } from "./ports.ts";
import { parseBindCreate, parseBindPatch, parsePortCreate, parsePortPatch } from "./ports-parse.ts";
import { scopeOf } from "./scope.ts";
import {
  portBindSelectors,
  portSelectors,
  selectBindsInSpace,
  selectBindsOnServer,
  selectPortsInSpace,
} from "./state/slices/ports.ts";
import { serverSelectors } from "./state/slices/servers.ts";
import {
  bindPort,
  createPort,
  deletePort,
  unbindPort,
  updatePort,
  updatePortBind,
} from "./state/thunks/ports.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

export function defaultServerIdOf(
  binds: readonly PortBind[],
  portId: string,
): string | null {
  for (const bind of binds) {
    if (bind.portId === portId && bind.defaultServer) {
      return bind.serverId;
    }
  }
  return null;
}

export function jsonPort(
  row: Port,
  bindCount = 0,
  defaultServerId: string | null = null,
) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    address: row.address,
    port: row.port,
    ssl: row.ssl,
    http2: row.http2,
    proxy_protocol: row.proxyProtocol,
    bind_count: bindCount,
    default_server_id: defaultServerId,
  };
}

export function jsonBind(row: PortBind) {
  return {
    uuid: row.id,
    server_id: row.serverId,
    port_id: row.portId,
    default_server: row.defaultServer,
    name: row.port.name,
    address: row.port.address,
    port: row.port.port,
    ssl: row.port.ssl,
    http2: row.port.http2,
    proxy_protocol: row.port.proxyProtocol,
  };
}

function portInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): Port | undefined {
  const row = portSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}

export function portsRouter(
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
    const binds = selectBindsInSpace(getState(), scope);
    res.json({
      ports: selectPortsInSpace(getState(), scope).map((row) => {
        const onPort = binds.filter((bind) => bind.portId === row.id);
        return jsonPort(row, onPort.length, defaultServerIdOf(onPort, row.id));
      }),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);
      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      const parsed = parsePortCreate(req.body, spaceId);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const row = await dispatch(createPort(parsed.value)).unwrap();
      log("info", "port created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonPort(row, 0));
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
    const row = portInScope(getState, id, scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const onPort = selectBindsInSpace(getState(), scope).filter(
      (bind) => bind.portId === id,
    );
    res.json(jsonPort(row, onPort.length, defaultServerIdOf(onPort, id)));
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
      if (portInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const parsed = parsePortPatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const row = await dispatch(updatePort({ id, patch: parsed.value })).unwrap();
      log("info", "port updated", { uuid: row.id, name: row.name });
      const onPort = selectBindsInSpace(getState(), scope).filter(
        (bind) => bind.portId === id,
      );
      res.json(jsonPort(row, onPort.length, defaultServerIdOf(onPort, id)));
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
      if (portInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(deletePort({ id })).unwrap();
      log("info", "port deleted", { uuid: row.id, name: row.name });
      res.json(jsonPort(row, 0));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}

export function mountServerPortRoutes(
  router: Router,
  dispatch: AppDispatch,
  getState: () => RootState,
  serverInScope: (id: string, scope: string) => unknown,
): void {
  router.get("/:uuid/ports", (req, res) => {
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
    if (serverInScope(id, scope) === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ listens: selectBindsOnServer(getState(), id).map(jsonBind) });
  });

  router.post("/:uuid/ports", async (req: Request, res: Response, next) => {
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
      if (serverInScope(id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const parsed = parseBindCreate(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const port = portInScope(getState, parsed.value.portId, scope);
      if (port === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(
        bindPort({
          serverId: id,
          portId: parsed.value.portId,
          defaultServer: parsed.value.defaultServer,
        }),
      ).unwrap();
      log("info", "port bound", { server: id, port: row.portId });
      res.status(201).json(jsonBind(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.put("/:uuid/ports/:bindUuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const serverId = asUuid(req.params.uuid);
      const bindId = asUuid(req.params.bindUuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (serverId === undefined || bindId === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (serverInScope(serverId, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const bind = portBindSelectors.selectById(getState(), bindId);
      if (bind === undefined || bind.serverId !== serverId) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const parsed = parseBindPatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const row = await dispatch(
        updatePortBind({ id: bindId, defaultServer: parsed.value.defaultServer }),
      ).unwrap();
      res.json(jsonBind(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid/ports/:bindUuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const serverId = asUuid(req.params.uuid);
      const bindId = asUuid(req.params.bindUuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (serverId === undefined || bindId === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (serverInScope(serverId, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const bind = portBindSelectors.selectById(getState(), bindId);
      if (bind === undefined || bind.serverId !== serverId) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(unbindPort({ id: bindId })).unwrap();
      res.json(jsonBind(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });
}

export function serverInSpace(
  getState: () => RootState,
  id: string,
  scope: string,
) {
  const row = serverSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}
