import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { jsonHttpInheritance } from "./inheritance.ts";
import { log } from "./log.ts";
import type { HttpSpace } from "./model/http-space.ts";
import type { WafHttpSettings } from "./model/settings.ts";
import { scopeOf } from "./scope.ts";
import { parseSpaceHttpBody } from "./space-settings-parse.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import { updateSpace } from "./state/thunks/spaces.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

function panelWafHttp(wafHttp: WafHttpSettings): WafHttpSettings {
  const { nodeId: _drop, bus, ...rest } = wafHttp;
  if (bus === undefined) {
    return rest;
  }
  const { urls: _urls, ...busRest } = bus;
  return { ...rest, bus: busRest };
}

export interface SpaceInfra {
  natsUrl?: string;
  redisUrl?: string;
  redisInternalUrl?: string;
}

function redacted(raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    return "";
  }

  try {
    const u = new URL(raw);
    if (u.password !== "") {
      u.password = "***";
    }
    return u.toString();
  } catch {
    return "<unparsable>";
  }
}

export function jsonSpaceHttp(row: HttpSpace, infra: SpaceInfra = {}) {
  return {
    uuid: row.id,
    name: row.name,
    raw: row.raw,
    raw_nginx: row.rawNginx,
    nginx_main: row.nginxMain,
    nginx: row.nginx,
    waf_http: panelWafHttp(row.wafHttp),
    waf: row.waf,
    infra: {
      nats_url: infra.natsUrl ?? "",
      redis_url: redacted(infra.redisUrl),
      redis_internal_url: redacted(infra.redisInternalUrl),
    },
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function spaceSettingsRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  infra: SpaceInfra = {},
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const row = spaceSelectors.selectById(getState(), scope);

    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonSpaceHttp(row, infra));
  });

  router.get("/inheritance", (req, res) => {
    const scope = scopeOf(req);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const row = spaceSelectors.selectById(getState(), scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonHttpInheritance(row));
  });

  router.put("/", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const parsed = parseSpaceHttpBody(req.body);

      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const row = await dispatch(
        updateSpace({ id: scope, patch: parsed.value }),
      ).unwrap();

      log("info", "space http updated", { uuid: row.id, name: row.name });
      res.json(jsonSpaceHttp(row, infra));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
