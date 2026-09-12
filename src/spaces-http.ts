import { Router } from "express";

import { spaceSelectors } from "./state/slices/spaces.ts";
import type { RootState } from "./state/types.ts";

/**
 * Каталог пространств — не конфигурация внутри пространства, а то, как UX
 * узнаёт uuid для `/api/<scope>/…`. Как `/api/meta`.
 */
export function spacesRouter(getState: () => RootState): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      spaces: spaceSelectors.selectAll(getState()).map((row) => ({
        uuid: row.id,
        name: row.name,
        raw: row.raw,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
    });
  });

  return router;
}
