import { Router } from "express";

import { snapshotFleet } from "./state/fleet-view.ts";
import { fleetForget, membersNamed } from "./state/slices/fleet.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const MAX_NAMES = 512;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,252}$/;

export function fleetRouter(dispatch: AppDispatch, getState: () => RootState): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(snapshotFleet(getState()));
  });

  // The installer names the containers it removed: node ids and container hostnames. Their members
  // leave the fleet and the convergence at once.
  router.post("/forget", (req, res) => {
    const names: unknown = req.body?.names;

    if (
      !Array.isArray(names) ||
      names.length === 0 ||
      names.length > MAX_NAMES ||
      !names.every((name) => typeof name === "string" && NAME_RE.test(name))
    ) {
      res.status(400).json({ error: "invalid_names" });
      return;
    }

    const named = membersNamed(getState().fleet, new Set(names));
    dispatch(fleetForget({ names }));

    res.json({
      forgotten: Object.values(named).reduce((sum, ids) => sum + ids.length, 0),
      agents: named.agents,
      inspectors: named.inspectors.length,
      stores: named.stores.length,
      services: named.services.length,
    });
  });

  return router;
}
