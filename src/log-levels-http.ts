import { Router } from "express";

import type { DesiredStore } from "./desired.ts";
import { log } from "./log.ts";
import {
  emptyLogLevels,
  LOG_LEVELS_KIND,
  LOG_SERVICES,
  parseLogLevelsBody,
  type LogLevelsDoc,
} from "./log-levels.ts";

function jsonLogLevels(doc: LogLevelsDoc) {
  return { rev: doc.rev, levels: doc.levels, services: LOG_SERVICES };
}

export function logLevelsRouter(desired: DesiredStore): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(jsonLogLevels((await desired.getLogLevels()) ?? emptyLogLevels()));
    } catch (err) {
      next(err);
    }
  });

  router.put("/", async (req, res, next) => {
    try {
      const parsed = parseLogLevelsBody(req.body);

      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const current = (await desired.getLogLevels()) ?? emptyLogLevels();
      const doc: LogLevelsDoc = {
        v: 1,
        kind: LOG_LEVELS_KIND,
        rev: current.rev + 1,
        levels: parsed.levels,
      };

      await desired.putLogLevels(doc);
      log("info", "log levels saved", { rev: doc.rev, levels: doc.levels });
      res.json(jsonLogLevels(doc));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
