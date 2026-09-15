import { Router } from "express";

import { ACTIONS, ACTION_AXES, ACTION_COMMON } from "./model/actions.ts";

export function actionsRouter(): Router {
  const router = Router();

  const body = {
    v: 1,
    axes: ACTION_AXES,
    verbs: ACTIONS,
    common: ACTION_COMMON,
  };

  router.get("/", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(body);
  });

  return router;
}
