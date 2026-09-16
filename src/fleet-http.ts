import { Router } from "express";

import { snapshotFleet } from "./state/fleet-view.ts";
import type { RootState } from "./state/types.ts";

export function fleetRouter(getState: () => RootState): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(snapshotFleet(getState()));
  });

  return router;
}
