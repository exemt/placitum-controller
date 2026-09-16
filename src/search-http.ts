import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

const RECORD = ["inspectors", "findings", "headers", "args", "body"] as const;

export function searchRouter(searchUrl: string): Router {
  const router = Router();
  const base = searchUrl.replace(/\/$/, "");

  const forward = (path: (req: Request) => string) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (base === "") {
        res.status(503).json({ error: "search_disabled" });
        return;
      }

      const gone = new AbortController();
      res.on("close", () => {
        if (!res.writableFinished) {
          gone.abort();
        }
      });

      try {
        const row = await proxy(base, path(req), gone.signal);
        res.status(row.status).json(row.body);
      } catch (err) {
        if (gone.signal.aborted) {
          return;
        }
        if (unreachable(err)) {
          res.status(503).json({ error: "search_unreachable" });
          return;
        }
        next(err);
      }
    };

  router.get("/audit", forward((req) => `/api/audit${search(req.url)}`));

  router.get("/audit/groups", forward((req) => `/api/audit/groups${search(req.url)}`));

  router.get("/findings", forward((req) => `/api/findings${search(req.url)}`));

  router.get("/logs", forward((req) => `/api/logs${search(req.url)}`));
  router.get("/logs/facets", forward((req) => `/api/logs/facets${search(req.url)}`));

  router.get(
    "/audit/:node/:ray",
    forward((req) => `/api/audit/${record(req)}${search(req.url)}`),
  );

  for (const leaf of RECORD) {
    router.get(
      `/audit/:node/:ray/${leaf}`,
      forward((req) => `/api/audit/${record(req)}/${leaf}${search(req.url)}`),
    );
  }

  return router;
}

function record(req: Request): string {
  return `${segment(req.params.node)}/${segment(req.params.ray)}`;
}

function segment(value: string | string[] | undefined): string {
  return encodeURIComponent(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
}

function search(url: string): string {
  const at = url.indexOf("?");

  return at < 0 ? "" : url.slice(at);
}

async function proxy(
  base: string,
  path: string,
  gone: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    signal: AbortSignal.any([gone, AbortSignal.timeout(15_000)]),
  });
  const text = await res.text();
  let body: unknown = { error: text || "search_failed" };
  try {
    body = JSON.parse(text) as unknown;
  } catch {
  }
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
