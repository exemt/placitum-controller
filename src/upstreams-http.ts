import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { UpstreamPeer, UpstreamTree } from "./model/upstream.ts";
import { scopeOf } from "./scope.ts";
import { selectLocationsInSpace } from "./state/slices/locations.ts";
import {
  selectUpstreamsInSpace,
  upstreamSelectors,
} from "./state/slices/upstreams.ts";
import {
  createUpstream,
  deleteUpstream,
  updateUpstream,
} from "./state/thunks/upstreams.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import { parseUpstreamCreate, parseUpstreamPatch } from "./upstreams-parse.ts";

function jsonPeer(row: UpstreamPeer) {
  return {
    uuid: row.id,
    host: row.host,
    port: row.port,
    weight: row.weight,
    max_fails: row.maxFails ?? null,
    fail_timeout_ms: row.failTimeoutMs ?? null,
    backup: row.backup,
    down: row.down,
    position: row.position,
  };
}

export function jsonUpstream(row: UpstreamTree, bindCount = 0) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    method: row.method,
    hash_key: row.hashKey ?? null,
    keepalive: row.keepalive ?? null,
    keepalive_requests: row.keepaliveRequests ?? null,
    keepalive_timeout_ms: row.keepaliveTimeoutMs ?? null,
    tls: row.tls ?? false,
    tls_name: row.tlsName ?? null,
    host_header: row.hostHeader ?? null,
    peer_count: row.peers.length,
    bind_count: bindCount,
    peers: row.peers.map(jsonPeer),
  };
}

export function bindCountOf(
  getState: () => RootState,
  upstreamId: string,
  scope: string,
): number {
  return selectLocationsInSpace(getState(), scope).filter(
    (row) => row.upstreamId === upstreamId,
  ).length;
}

export function upstreamInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): UpstreamTree | undefined {
  const row = upstreamSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}

export function upstreamsRouter(
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
    res.json({
      upstreams: selectUpstreamsInSpace(getState(), scope).map((row) =>
        jsonUpstream(row, bindCountOf(getState, row.id, scope)),
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
      const parsed = parseUpstreamCreate(req.body, spaceId);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const row = await dispatch(createUpstream(parsed.value)).unwrap();
      log("info", "upstream created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonUpstream(row, 0));
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
    const row = upstreamInScope(getState, id, scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(jsonUpstream(row, bindCountOf(getState, id, scope)));
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
      if (upstreamInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const parsed = parseUpstreamPatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const row = await dispatch(
        updateUpstream({ id, patch: parsed.value }),
      ).unwrap();
      log("info", "upstream updated", { uuid: row.id, name: row.name });
      res.json(jsonUpstream(row, bindCountOf(getState, id, scope)));
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
      if (upstreamInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(deleteUpstream({ id })).unwrap();
      log("info", "upstream deleted", { uuid: row.id, name: row.name });
      res.json(jsonUpstream(row, 0));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
