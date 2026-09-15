import { Router } from "express";
import type { Request, Response } from "express";

import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { RuleFile, RuleFileMeta } from "./model/rule-set.ts";
import { scopeOf } from "./scope.ts";
import {
  ruleFileSelectors,
  selectRuleFilesInSpace,
} from "./state/slices/rule-files.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import {
  createRuleFile,
  deleteRuleFile,
  updateRuleFile,
} from "./state/thunks/rule-files.ts";
import type { RuleFileRepo } from "./rule-files.ts";
import { usesDetail } from "./usage.ts";

const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function jsonMeta(meta: RuleFileMeta) {
  return {
    uuid: meta.id,
    http_space_id: meta.httpSpaceId,
    name: meta.name,
    description: meta.description,
    created_at: meta.createdAt.toISOString(),
    updated_at: meta.updatedAt.toISOString(),
  };
}

function jsonFile(row: RuleFile) {
  return {
    ...jsonMeta(row),
    text_raw: row.textRaw,
  };
}

function parseName(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !FILE_NAME_RE.test(value)) {
    return "bad";
  }

  return value;
}

function parseText(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : "bad";
}

export function ruleFilesRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: RuleFileRepo,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      rule_files: selectRuleFilesInSpace(getState(), scope).map(jsonMeta),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as {
        name?: unknown;
        description?: unknown;
        text_raw?: unknown;
      };

      const name = parseName(body.name);

      if (name === undefined || name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const textRaw = parseText(body.text_raw);

      if (textRaw === "bad") {
        res.status(400).json({ error: "invalid_text" });
        return;
      }

      const description =
        body.description === undefined
          ? ""
          : typeof body.description === "string"
            ? body.description
            : null;

      if (description === null) {
        res.status(400).json({ error: "invalid_description" });
        return;
      }

      const row = await dispatch(
        createRuleFile({
          httpSpaceId: spaceId,
          name,
          description,
          textRaw: textRaw ?? "",
        }),
      ).unwrap();

      log("info", "rule file created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonFile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
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

      const meta = ruleFileSelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonFile(row));
    } catch (err) {
      next(err);
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

      const existing = ruleFileSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        text_raw?: unknown;
      };

      const name = parseName(body.name);
      const description = parseText(body.description);
      const textRaw = parseText(body.text_raw);

      if (name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }

      if (textRaw === "bad") {
        res.status(400).json({ error: "invalid_text" });
        return;
      }

      const row = await dispatch(
        updateRuleFile({ id, patch: { name, description, textRaw } }),
      ).unwrap();

      log("info", "rule file updated", { uuid: row.id, name: row.name });
      res.json(jsonFile(row));
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

      const existing = ruleFileSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const uses = await repo.setUses(id, existing.name, existing.httpSpaceId);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      const row = await dispatch(deleteRuleFile({ id })).unwrap();

      log("info", "rule file deleted", { uuid: row.id, name: row.name });
      res.json(jsonFile(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
