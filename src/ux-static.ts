import { join } from "node:path";

import express from "express";
import type { Express } from "express";

export function mountUx(app: Express, uxDir: string): void {
  app.use(express.static(uxDir, { index: false, fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (
      req.path === "/healthz" ||
      req.path === "/agent_health_socket" ||
      req.path.startsWith("/api")
    ) {
      next();
      return;
    }

    res.sendFile(join(uxDir, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}
