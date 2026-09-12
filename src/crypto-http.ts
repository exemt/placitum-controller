import { Router } from "express";

import type { ContourCrypto } from "./crypto.ts";

/**
 * Публичный ключ контура. Один на окружение, путь scoped — как у любого
 * ресурса конфигурации. Приватной половины здесь нет.
 */
export function cryptoRouter(crypto: ContourCrypto | undefined): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (_req, res) => {
    if (crypto === undefined) {
      res.status(503).json({ error: "crypto_unavailable" });
      return;
    }

    res.json({
      alg: crypto.alg,
      public_key: crypto.publicKeyPem,
      fingerprint: crypto.fingerprint,
    });
  });

  return router;
}
