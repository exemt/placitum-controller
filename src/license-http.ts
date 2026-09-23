import { Router } from "express";

import type { LicenseService } from "./license.ts";

/* The license of the installation: what it grants, and the key from the panel. */
export function licenseRouter(license: LicenseService): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(license.view());
  });

  router.put("/", async (req, res, next) => {
    try {
      const key = (req.body as { key?: unknown }).key;

      if (typeof key !== "string" || key.trim() === "") {
        res.status(400).json({ error: "invalid_key" });
        return;
      }

      const result = await license.apply(key);

      if (!result.ok) {
        res.status(400).json({ error: `key_${result.error}` });
        return;
      }

      res.json(license.view());
    } catch (err) {
      next(err);
    }
  });

  router.delete("/", async (_req, res, next) => {
    try {
      await license.remove();
      res.json(license.view());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
