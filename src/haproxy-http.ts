import { Router } from "express";

import type { HaproxySettingsRepo } from "./haproxy-settings.ts";
import {
  jsonHaproxySettings,
  parseHaproxySettingsBody,
} from "./haproxy-settings-parse.ts";
import {
  buildHaproxyConf,
  haproxyEntries,
  hashHaproxyConf,
  jsonHaproxyConf,
  jsonHaproxyEntry,
  renderHaproxyCfg,
} from "./compile/haproxy.ts";
import type { DesiredStore } from "./desired.ts";
import { log } from "./log.ts";
import type { HaproxySettings } from "./model/haproxy.ts";
import type { Port } from "./model/listen.ts";
import type { PortRepo } from "./ports.ts";
import { scopeOf } from "./scope.ts";

function jsonDoc(
  settings: HaproxySettings,
  ports: readonly Port[],
  updatedAt: Date | null,
): Record<string, unknown> {
  return {
    settings: jsonHaproxySettings(settings),
    entries: haproxyEntries(settings, ports).map(jsonHaproxyEntry),
    updated_at: updatedAt?.toISOString() ?? null,
    sha256: hashHaproxyConf(settings, ports),
  };
}

export function haproxyRouter(
  repo: HaproxySettingsRepo,
  ports: PortRepo,
  desired: DesiredStore,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await repo.get(scope);
      res.json(jsonDoc(row.settings, await ports.list(scope), row.updatedAt));
    } catch (err) {
      next(err);
    }
  });

  router.put("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const parsed = parseHaproxySettingsBody(req.body);

      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const row = await repo.save(scope, parsed.value);
      log("info", "haproxy settings saved", { scope });
      res.json(jsonDoc(row.settings, await ports.list(scope), row.updatedAt));
    } catch (err) {
      next(err);
    }
  });

  router.get("/preview", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await repo.get(scope);
      res.type("text/plain").send(renderHaproxyCfg(row.settings, await ports.list(scope)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/send", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await repo.get(scope);
      const rows = await ports.list(scope);
      const hash = hashHaproxyConf(row.settings, rows);
      const current = await desired.getHaproxyConf().catch(() => null);

      if (current !== null && current.sha256 === hash) {
        await desired.markPublished("haproxy");
        res.json(jsonHaproxyConf(current));
        return;
      }

      const pointer = buildHaproxyConf(row.settings, rows, (current?.rev ?? 0) + 1);
      await desired.putHaproxyConf(pointer);

      log("info", "haproxy conf sent", {
        scope,
        rev: pointer.rev,
        sha256: pointer.sha256,
      });
      res.json(jsonHaproxyConf(pointer));
    } catch (err) {
      next(err);
    }
  });

  router.get("/desired", async (_req, res, next) => {
    try {
      const pointer = await desired.getHaproxyConf();
      if (pointer === null) {
        res.json({ rev: null, sha256: null });
        return;
      }
      res.json(jsonHaproxyConf(pointer));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
