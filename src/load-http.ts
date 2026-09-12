import { Router } from "express";

/**
 * Прокси к loadgen в deploy/: кнопка в UX не ходит в docker и не
 * пересоздаёт край. Пустой URL — генератора в этом процессе нет.
 *
 * GET  /       состояние прогона (loadgen GET /run)
 * POST /       старт прогона (loadgen POST /run)
 * GET  /cases  каталог кейсов tests/load (loadgen GET /cases)
 */
export function loadRouter(loadgenUrl: string): Router {
  const router = Router();
  const base = loadgenUrl.replace(/\/$/, "");

  router.get("/", async (_req, res, next) => {
    if (base === "") {
      res.json({ status: "disabled" });
      return;
    }
    try {
      const row = await proxy(base, "GET", "/run");
      res.status(row.status).json(row.body);
    } catch (err) {
      if (unreachable(err)) {
        res.status(503).json({ error: "loadgen_unreachable", status: "disabled" });
        return;
      }
      next(err);
    }
  });

  router.get("/cases", async (_req, res, next) => {
    if (base === "") {
      res.status(503).json({ error: "loadgen_disabled", cases: [] });
      return;
    }
    try {
      const row = await proxy(base, "GET", "/cases");
      res.status(row.status).json(row.body);
    } catch (err) {
      if (unreachable(err)) {
        res.status(503).json({ error: "loadgen_unreachable", cases: [] });
        return;
      }
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    if (base === "") {
      res.status(503).json({ error: "loadgen_disabled" });
      return;
    }
    try {
      const row = await proxy(base, "POST", "/run", req.body);
      res.status(row.status).json(row.body);
    } catch (err) {
      if (unreachable(err)) {
        res.status(503).json({ error: "loadgen_unreachable" });
        return;
      }
      next(err);
    }
  });

  return router;
}

async function proxy(
  base: string,
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: payload !== undefined ? { "content-type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload ?? {}) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const body: unknown = await res.json();
  return { status: res.status, body };
}

function unreachable(err: unknown): boolean {
  if (err instanceof Error && err.name === "TimeoutError") {
    return true;
  }
  if (err instanceof TypeError) {
    return true;
  }
  return false;
}
