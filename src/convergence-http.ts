/**
 * `/api/:scope/convergence` -- три уровня сходимости одним документом.
 *
 * Отсюда живёт лампа в шапке, чип на странице и проверка в e2e. Снимок
 * считается по состоянию процесса, но перед ответом досчитывается всё, что
 * устарело: спросили -- значит смотрят, и отвечать вчерашним хешем нельзя.
 */

import { Router } from "express";

import { snapshotConvergence } from "./convergence/view.ts";
import type { ConvergenceService } from "./convergence/service.ts";
import { isChannelId } from "./convergence/channels.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";

export function convergenceRouter(
  getState: () => RootState,
  service: ConvergenceService,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      await service.refresh(scope);
      res.json(snapshotConvergence(getState(), scope));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Пересчитать, не спрашивая срок годности. Нужен тестам: между правкой через
   * API и вопросом «разошлось ли» не должно стоять ожидание TTL.
   */
  router.post("/refresh", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const only = req.query.channel;

      if (typeof only === "string") {
        if (!isChannelId(only)) {
          res.status(400).json({ error: "unknown_channel" });
          return;
        }
        service.invalidate([only], scope);
      }

      await service.refresh(scope, typeof only !== "string");
      res.json(snapshotConvergence(getState(), scope));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
