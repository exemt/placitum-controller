import { Router } from "express";

import { snapshotFleet } from "./state/fleet-view.ts";
import type { RootState } from "./state/types.ts";

/**
 * Наблюдаемый кластер. Воркеры и агенты — разные секции Redux;
 * ответ — merge по node_id плюс инспекторы, store (Redis/S3) и сервисы.
 * Живой поток — `/agent_health_socket`.
 */
export function fleetRouter(getState: () => RootState): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(snapshotFleet(getState()));
  });

  return router;
}
