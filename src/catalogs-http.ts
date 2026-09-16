import { Router } from "express";
import type { Request, Response } from "express";

import {
  BodyStoreRepo,
  CATALOG_NAME_RE,
  DENY_PARAMS,
  DENY_TYPES,
  DenyResponseRepo,
  LOG_FORMAT_KINDS,
  LogFormatRepo,
  STORE_DRIVERS,
  type BodyStoreInput,
  type DenyResponseInput,
  type LogFormatInput,
} from "./catalogs.ts";
import type { Pool } from "./db.ts";
import { log } from "./log.ts";
import type { BodyStore, DenyResponse, LogFormat } from "./model/http-space.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { denyResponseUses, usesDetail, type Use } from "./usage.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function badName(name: unknown): boolean {
  return typeof name !== "string" || !CATALOG_NAME_RE.test(name);
}

function jsonDeny(row: DenyResponse) {
  return { uuid: row.id, name: row.name, type: row.type, spec: row.spec };
}

function jsonStoreWith(url: string) {
  return (row: BodyStore) => {
    const { url: _stale, driver: _drop, ...spec } = row.spec;
    return { uuid: row.id, name: row.name, driver: row.driver, url, spec };
  };
}

function jsonFormat(row: LogFormat) {
  return {
    uuid: row.id,
    name: row.name,
    kind: row.kind,
    fields: row.fields,
    format: row.format,
  };
}

function parseDeny(body: unknown): DenyResponseInput | string {
  if (!isRecord(body)) return "invalid_body";
  if (badName(body.name)) return "invalid_name";
  const type = body.type ?? "http";
  if (typeof type !== "string" || !(DENY_TYPES as readonly string[]).includes(type)) {
    return "invalid_type";
  }
  const raw = isRecord(body.spec) ? body.spec : {};
  const spec: DenyResponse["spec"] = {};

  if (raw.status !== undefined && raw.status !== null && raw.status !== "") {
    const status = Number(raw.status);
    if (!Number.isInteger(status)) return "invalid_status";
    if (type === "http" && (status < 400 || status > 599)) {
      return "status_not_error";
    }
    spec.status = status;
  }
  if (raw.code !== undefined && raw.code !== null && raw.code !== "") {
    const code = Number(raw.code);
    if (!Number.isInteger(code)) return "invalid_code";
    spec.code = code;
  }
  for (const key of ["page", "reason"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      spec[key] = value.trim();
    }
  }

  if (type !== "http") {
    const value = raw.message;
    if (typeof value === "string" && value.trim() !== "") {
      spec.message = value.trim();
    }
  }

  if (raw.params !== undefined && raw.params !== null) {
    if (!Array.isArray(raw.params)) return "invalid_params";
    const params: string[] = [];
    for (const word of raw.params) {
      if (typeof word !== "string" || !(DENY_PARAMS as readonly string[]).includes(word)) {
        return "invalid_params";
      }
      if (!params.includes(word)) params.push(word);
    }
    if (params.length > 0) spec.params = params;
  }

  return { name: body.name as string, type: type as DenyResponseInput["type"], spec };
}

const STORE_SPEC_KEYS = [
  "ttl",
  "retain_ttl",
  "max",
  "pool",
  "connect_timeout",
  "op_timeout",
  "reconnect_wait",
  "db",
] as const;

export function parseStore(body: unknown): BodyStoreInput | string {
  if (!isRecord(body)) return "invalid_body";
  if (badName(body.name)) return "invalid_name";
  const raw = isRecord(body.spec) ? body.spec : {};
  const spec: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "url" || key === "driver") continue;
    if (!(STORE_SPEC_KEYS as readonly string[]).includes(key)) return "invalid_spec";
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return "invalid_spec";
    }
    spec[key] = value;
  }
  return { name: body.name as string, driver: STORE_DRIVERS[0], spec };
}

function parseFormat(body: unknown): LogFormatInput | string {
  if (!isRecord(body)) return "invalid_body";
  if (badName(body.name)) return "invalid_name";
  const kind = body.kind ?? "waf";
  if (typeof kind !== "string" || !(LOG_FORMAT_KINDS as readonly string[]).includes(kind)) {
    return "invalid_kind";
  }
  const fields = Array.isArray(body.fields)
    ? body.fields.filter((f): f is string => typeof f === "string" && f.trim() !== "")
    : [];
  const format = typeof body.format === "string" ? body.format.trim() : "";

  if (kind === "nginx") {
    if (format === "") return "nginx_needs_format";
    if (format.includes("'")) return "format_has_quote";
  } else if (fields.length === 0) {
    return "waf_needs_fields";
  }

  return { name: body.name as string, kind: kind as LogFormatInput["kind"], fields, format };
}

type Repo<T, I> = {
  list(space: string): Promise<T[]>;
  create(space: string, input: I): Promise<T>;
  update(space: string, id: string, input: I): Promise<T | null>;
  remove(space: string, id: string): Promise<boolean>;
};

type Veto = { status: number; body: unknown };

function catalogRouterFor<T, I>(
  repo: Repo<T, I>,
  parse: (body: unknown) => I | string,
  toJson: (row: T, scope: string) => unknown,
  key: string,
  opts: {
    remove?: boolean;
    listJson?: (rows: T[], scope: string) => Promise<unknown[]>;
    beforeUpdate?: (scope: string, id: string, input: I) => Promise<Veto | undefined>;
    beforeRemove?: (scope: string, id: string) => Promise<Veto | undefined>;
  } = {},
): Router {
  const router = Router({ mergeParams: true });

  const scoped = (req: Request, res: Response): string | undefined => {
    const scope = scopeOf(req);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return undefined;
    }
    return scope;
  };

  router.get("/", async (req, res, next) => {
    try {
      const scope = scoped(req, res);
      if (scope === undefined) return;
      const rows = await repo.list(scope);
      res.json({
        [key]:
          opts.listJson === undefined
            ? rows.map((row) => toJson(row, scope))
            : await opts.listJson(rows, scope),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const scope = scoped(req, res);
      if (scope === undefined) return;
      const input = parse(req.body);
      if (typeof input === "string") {
        res.status(400).json({ error: input });
        return;
      }
      const row = await repo.create(scope, input);
      log("info", `${key} created`, { scope });
      res.status(201).json(toJson(row, scope));
    } catch (err) {
      next(duplicate(err, key));
    }
  });

  router.put("/:uuid", async (req, res, next) => {
    try {
      const scope = scoped(req, res);
      if (scope === undefined) return;
      const input = parse(req.body);
      if (typeof input === "string") {
        res.status(400).json({ error: input });
        return;
      }
      if (opts.beforeUpdate !== undefined) {
        const veto = await opts.beforeUpdate(scope, req.params.uuid, input);
        if (veto !== undefined) {
          res.status(veto.status).json(veto.body);
          return;
        }
      }
      const row = await repo.update(scope, req.params.uuid, input);
      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(toJson(row, scope));
    } catch (err) {
      next(duplicate(err, key));
    }
  });

  if (opts.remove !== false) {
    router.delete("/:uuid", async (req, res, next) => {
      try {
        const scope = scoped(req, res);
        if (scope === undefined) return;
        if (opts.beforeRemove !== undefined) {
          const veto = await opts.beforeRemove(scope, req.params.uuid);
          if (veto !== undefined) {
            res.status(veto.status).json(veto.body);
            return;
          }
        }
        const gone = await repo.remove(scope, req.params.uuid);
        res.status(gone ? 200 : 404).json(gone ? { ok: true } : { error: "not_found" });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}

function duplicate(err: unknown, key: string): unknown {
  if (err !== null && typeof err === "object" && (err as { code?: string }).code === "23505") {
    const conflict = new Error(`${key}: name is already taken`) as Error & {
      status?: number;
      body?: unknown;
    };
    conflict.status = 409;
    conflict.body = { error: "name_taken" };
    return conflict;
  }
  return err;
}

export function denyResponsesRouter(pool: Pool, getState: () => RootState): Router {
  const repo = new DenyResponseRepo(pool);

  const rowIn = async (scope: string, id: string) =>
    (await repo.list(scope)).find((row) => row.id === id);

  const usesOf = async (scope: string, name: string): Promise<Use[]> => [
    ...denyResponseUses(getState(), scope, name),
    ...((await repo.referenceUses(scope)).get(name) ?? []),
  ];

  const veto = (uses: Use[]): Veto | undefined =>
    uses.length === 0
      ? undefined
      : { status: 409, body: { error: "in_use", detail: usesDetail(uses), uses } };

  return catalogRouterFor(
    repo,
    parseDeny,
    (row) => jsonDeny(row),
    "deny_responses",
    {
      listJson: async (rows, scope) => {
        const held = await repo.referenceUses(scope);
        return rows.map((row) => ({
          ...jsonDeny(row),
          uses: [
            ...denyResponseUses(getState(), scope, row.name),
            ...(held.get(row.name) ?? []),
          ],
        }));
      },
      beforeUpdate: async (scope, id, input) => {
        const current = await rowIn(scope, id);
        if (current === undefined || current.name === input.name) return undefined;
        return veto(await usesOf(scope, current.name));
      },
      beforeRemove: async (scope, id) => {
        const current = await rowIn(scope, id);
        if (current === undefined) return undefined;
        return veto(await usesOf(scope, current.name));
      },
    },
  );
}

export function bodyStoresRouter(pool: Pool, redisUrl: string): Router {
  return catalogRouterFor(
    new BodyStoreRepo(pool),
    parseStore,
    jsonStoreWith(redisUrl),
    "body_stores",
    { remove: false },
  );
}

export function logFormatsRouter(pool: Pool): Router {
  return catalogRouterFor(new LogFormatRepo(pool), parseFormat, jsonFormat, "log_formats");
}
