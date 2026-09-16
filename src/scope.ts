import type { NextFunction, Request, Response } from "express";

import { asUuid } from "./model/id.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import type { RootState } from "./state/types.ts";

export function requireScope(getState: () => RootState) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = asUuid(req.params.scopeUuid);

    if (id === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    if (spaceSelectors.selectById(getState(), id) === undefined) {
      res.status(404).json({ error: "unknown_scope" });
      return;
    }

    next();
  };
}

export function scopeOf(req: Request): string | undefined {
  return asUuid(req.params.scopeUuid);
}
