import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import {
  findInspectorUses,
  mergeInspectorGraphs,
  type InspectorDecl,
  type InspectorUse,
} from "./inspector-graph.ts";
import {
  DEFAULT_LOG_LEVEL,
  isLogLevel,
  type LogLevel,
} from "./inspector-settings.ts";
import type { InspectorRepo } from "./inspectors.ts";
import { log } from "./log.ts";
import type { Inspector, InspectorMeta, InspectorPhase } from "./model/http-space.ts";
import { asUuid } from "./model/id.ts";
import { scopeOf } from "./scope.ts";
import {
  inspectorCatalogSelectors,
  selectInspectorsInSpace,
} from "./state/slices/inspectors.ts";
import { selectLocationsInSpace } from "./state/slices/locations.ts";
import { selectServersInSpace } from "./state/slices/servers.ts";
import { spaceSelectors } from "./state/slices/spaces.ts";
import {
  createInspector,
  deleteInspector,
  setInstalledInspectors,
  updateInspector,
} from "./state/thunks/inspectors.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SUBJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PHASES: InspectorPhase[] = ["request", "response", "frame"];

function jsonMeta(meta: InspectorMeta) {
  return {
    uuid: meta.id,
    http_space_id: meta.httpSpaceId,
    name: meta.name,
    subject: meta.subject,
    phases: meta.phases,
    description: meta.description ?? "",
    docs_url: meta.docsUrl ?? "",
    log_level: meta.logLevel ?? DEFAULT_LOG_LEVEL,
    position: meta.position ?? 0,
    ...(meta.createdAt ? { created_at: meta.createdAt.toISOString() } : {}),
    ...(meta.updatedAt ? { updated_at: meta.updatedAt.toISOString() } : {}),
  };
}

function jsonInspector(row: Inspector) {
  return {
    ...jsonMeta(row),
    conf: row.conf ?? "",
  };
}

function parseName(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !NAME_RE.test(value)) {
    return "bad";
  }
  return value;
}

function parseSubject(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !SUBJECT_RE.test(value)) {
    return "bad";
  }
  return value;
}

function parsePhases(body: {
  phase?: unknown;
  phases?: unknown;
}): InspectorPhase[] | undefined | "bad" {
  const raw = body.phases ?? body.phase;

  if (raw === undefined) {
    return undefined;
  }

  const list = Array.isArray(raw) ? raw : [raw];

  if (list.length === 0) {
    return "bad";
  }

  const out: InspectorPhase[] = [];

  for (const item of list) {
    if (typeof item !== "string" || !PHASES.includes(item as InspectorPhase)) {
      return "bad";
    }

    if (!out.includes(item as InspectorPhase)) {
      out.push(item as InspectorPhase);
    }
  }

  return PHASES.filter((p) => out.includes(p));
}

function parseText(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : "bad";
}

function parseLogLevel(value: unknown): LogLevel | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }
  return isLogLevel(value) ? value : "bad";
}

function usesOf(state: RootState, scope: string, name: string): InspectorUse[] {
  const space = spaceSelectors.selectById(state, scope);
  const servers = selectServersInSpace(state, scope);
  const locations = selectLocationsInSpace(state, scope);

  const raw = findInspectorUses(name, [
    { at: "space", waf: space?.waf },
    ...servers.map((row) => ({ at: `server ${row.name}`, waf: row.waf })),
    ...locations.map((row) => ({ at: `location ${row.path}`, waf: row.waf })),
  ]);

  type WafDoc = { inspectors?: Record<string, InspectorDecl> } | undefined;
  const graphOf = (waf: unknown): Record<string, InspectorDecl> | undefined =>
    (waf as WafDoc)?.inspectors;
  const merged = mergeInspectorGraphs(graphOf(space?.waf), [
    ...servers.map((row) => ({ server: graphOf(row.waf), locations: [] })),
    { server: undefined, locations: locations.map((row) => graphOf(row.waf)) },
  ]);
  const decl = merged[name];
  const resolvesHere = decl !== undefined && (decl.process ?? name) === name;

  return raw.filter((use) => {
    switch (use.kind) {
      case "process":
        return true;
      case "declared":
        return resolvesHere;
      default:
        return decl === undefined;
    }
  });
}

export function inspectorsRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: InspectorRepo,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      inspectors: selectInspectorsInSpace(getState(), scope).map(jsonMeta),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as {
        name?: unknown;
        subject?: unknown;
        phase?: unknown;
        phases?: unknown;
        description?: unknown;
        docs_url?: unknown;
        log_level?: unknown;
        conf?: unknown;
      };

      const name = parseName(body.name);
      const subject = parseSubject(body.subject);
      const phases = parsePhases(body);
      const description = parseText(body.description);
      const docsUrl = parseText(body.docs_url);
      const logLevel = parseLogLevel(body.log_level);
      const conf = parseText(body.conf);

      if (name === undefined || name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }
      if (subject === undefined || subject === "bad") {
        res.status(400).json({ error: "invalid_subject" });
        return;
      }
      if (phases === "bad") {
        res.status(400).json({ error: "invalid_phase" });
        return;
      }
      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }
      if (docsUrl === "bad") {
        res.status(400).json({ error: "invalid_docs_url" });
        return;
      }
      if (logLevel === "bad") {
        res.status(400).json({ error: "invalid_log_level" });
        return;
      }
      if (conf === "bad") {
        res.status(400).json({ error: "invalid_conf" });
        return;
      }

      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await dispatch(
        createInspector({
          httpSpaceId: spaceId,
          name,
          subject,
          phases,
          description: description ?? "",
          docsUrl: docsUrl ?? "",
          logLevel,
          conf: conf ?? "",
        }),
      ).unwrap();

      log("info", "inspector created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonInspector(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/declared", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const state = getState();
    const space = spaceSelectors.selectById(state, scope);
    const servers = selectServersInSpace(state, scope);
    const locations = selectLocationsInSpace(state, scope);

    type WafDoc = { inspectors?: Record<string, InspectorDecl> } | undefined;
    const graphOf = (waf: unknown): Record<string, InspectorDecl> | undefined =>
      (waf as WafDoc)?.inspectors;

    const graph = mergeInspectorGraphs(graphOf(space?.waf), [
      ...servers.map((row) => ({ server: graphOf(row.waf), locations: [] })),
      { server: undefined, locations: locations.map((row) => graphOf(row.waf)) },
    ]);

    const catalog = new Map(
      selectInspectorsInSpace(state, scope).map((row) => [row.name, row]),
    );

    res.json({
      declared: Object.entries(graph).map(([name, decl]) => {
        const process = decl.process ?? name;
        const row = catalog.get(process);
        return {
          name,
          process,
          subject: row?.subject ?? null,
          phases: row?.phases ?? [],
          profile: decl.profile ?? "default",
          known: row !== undefined,
        };
      }),
    });
  });

  router.get("/:uuid", async (req, res, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const meta = inspectorCatalogSelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonInspector(row));
    } catch (err) {
      next(err);
    }
  });

  // The installer sets which shipped processes run; an unknown or still used name refuses the whole set.
  router.put("/installed", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const raw = (req.body as { names?: unknown } | undefined)?.names;

      if (!Array.isArray(raw) || raw.some((name) => typeof name !== "string")) {
        res.status(400).json({ error: "invalid_names" });
        return;
      }

      const names = [...new Set(raw as string[])];
      const shipped = new Set(await repo.shippedNames(scope));
      const unknown = names.filter((name) => !shipped.has(name));

      if (unknown.length > 0) {
        res.status(400).json({ error: "unknown_inspector", names: unknown });
        return;
      }

      const leaving = selectInspectorsInSpace(getState(), scope)
        .map((row) => row.name)
        .filter((name) => !names.includes(name));

      for (const name of leaving) {
        const uses = usesOf(getState(), scope, name);

        if (uses.length > 0) {
          res.status(409).json({ error: "inspector_in_use", name, uses });
          return;
        }
      }

      await dispatch(setInstalledInspectors({ httpSpaceId: scope, names })).unwrap();

      log("info", "inspectors installed", { names });
      res.json({ installed: names });
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.put("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const existing = inspectorCatalogSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        subject?: unknown;
        phase?: unknown;
        phases?: unknown;
        description?: unknown;
        docs_url?: unknown;
        log_level?: unknown;
        conf?: unknown;
      };

      const name = parseName(body.name);
      const subject = parseSubject(body.subject);
      const phases = parsePhases(body);
      const description = parseText(body.description);
      const docsUrl = parseText(body.docs_url);
      const logLevel = parseLogLevel(body.log_level);
      const conf = parseText(body.conf);

      if (name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }
      if (subject === "bad") {
        res.status(400).json({ error: "invalid_subject" });
        return;
      }
      if (phases === "bad") {
        res.status(400).json({ error: "invalid_phase" });
        return;
      }
      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }
      if (docsUrl === "bad") {
        res.status(400).json({ error: "invalid_docs_url" });
        return;
      }
      if (logLevel === "bad") {
        res.status(400).json({ error: "invalid_log_level" });
        return;
      }
      if (conf === "bad") {
        res.status(400).json({ error: "invalid_conf" });
        return;
      }

      const row = await dispatch(
        updateInspector({
          id,
          patch: { name, subject, phases, description, docsUrl, logLevel, conf },
        }),
      ).unwrap();

      log("info", "inspector updated", { uuid: row.id, name: row.name });
      res.json(jsonInspector(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const meta = inspectorCatalogSelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const uses = usesOf(getState(), scope, meta.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "inspector_in_use", uses });
        return;
      }

      const row = await dispatch(deleteInspector({ id })).unwrap();

      log("info", "inspector deleted", { uuid: row.id, name: row.name });
      res.json(jsonInspector(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
