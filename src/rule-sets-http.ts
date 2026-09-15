import {
  normalizePolicy,
  policyIsEmpty,
  PolicyError,
  validatePolicy,
  type ModsecPolicy,
} from "./modsec-policy-doc.ts";
import { Router } from "express";
import type { Request, Response } from "express";

import {
  DEFAULT_RULE_SET_BASELINE,
  isDefaultRename,
  ruleSetDiffersFromBaseline,
} from "./default-profile.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { RuleSet, RuleSetMember, RuleSetMeta } from "./model/rule-set.ts";
import type { RuleSetRepo } from "./rule-sets.ts";
import { scopeOf } from "./scope.ts";
import { selectRuleFilesInSpace } from "./state/slices/rule-files.ts";
import {
  ruleSetSelectors,
  selectRuleSetsInSpace,
} from "./state/slices/rule-sets.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import {
  createRuleSet,
  deleteRuleSet,
  updateRuleSet,
} from "./state/thunks/rule-sets.ts";
import { DEFAULT_PROFILE } from "./rules-manifest.ts";
import { profileUses, usesDetail } from "./usage.ts";

function jsonMeta(meta: RuleSetMeta) {
  return {
    uuid: meta.id,
    http_space_id: meta.httpSpaceId,
    name: meta.name,
    description: meta.description,
    file_count: meta.files,
    created_at: meta.createdAt.toISOString(),
    updated_at: meta.updatedAt.toISOString(),
  };
}

function jsonMember(file: RuleSetMember) {
  return {
    uuid: file.fileId,
    name: file.name,
  };
}

function jsonRuleSet(row: RuleSet) {
  return {
    ...jsonMeta({ ...row, files: row.files.length }),
    files: row.files.map(jsonMember),
    data_files: row.data.map((item) => ({
      uuid: item.datasetId,
      name: item.name,
      file: item.file,
    })),
    policy: row.policy,
    modified:
      row.name === DEFAULT_PROFILE &&
      ruleSetDiffersFromBaseline(
        row.description,
        row.files.map((file) => file.name),
        row.data.map((item) => item.name),
        policyIsEmpty(row.policy),
      ),
  };
}

function parseName(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return "bad";
  }

  const name = value.trim();

  return name.length === 0 ? "bad" : name;
}

function parseText(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : "bad";
}

function parseFileIds(value: unknown): string[] | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return "bad";
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const id = asUuid(item);

    if (id === undefined) {
      return "bad";
    }

    if (seen.has(id)) {
      return "bad";
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function ruleSetsRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: RuleSetRepo,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      rule_sets: selectRuleSetsInSpace(getState(), scope).map(jsonMeta),
    });
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as {
        name?: unknown;
        description?: unknown;
        files?: unknown;
        data_files?: unknown;
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

      const files = parseFileIds(body.files);

      if (files === "bad") {
        res.status(400).json({ error: "invalid_files" });
        return;
      }

      // Файлы данных -- те же uuid, что и файлы правил: наборы вида content.
      const dataFiles = parseFileIds(body.data_files);

      if (dataFiles === "bad") {
        res.status(400).json({ error: "invalid_data_files" });
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
        createRuleSet({
          httpSpaceId: spaceId,
          name,
          description,
          files: files ?? [],
          dataFiles: dataFiles ?? [],
        }),
      ).unwrap();

      log("info", "rule set created", {
        uuid: row.id,
        name: row.name,
        files: row.files.length,
      });

      res.status(201).json(jsonRuleSet(row));
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

      const meta = ruleSetSelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      /*
       * Подсказка поля поводов в правилах приёма: что отправители контура
       * вообще объявили. Только с карточкой -- списку наборов она не нужна.
       */
      const senderCodes = await repo.senderCodes(scope);

      res.json({ ...jsonRuleSet(row), sender_codes: senderCodes });
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

      const existing = ruleSetSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        files?: unknown;
        data_files?: unknown;
        policy?: unknown;
      };

      const name = parseName(body.name);
      const description = parseText(body.description);
      const files = parseFileIds(body.files);
      const dataFiles = parseFileIds(body.data_files);

      if (dataFiles === "bad") {
        res.status(400).json({ error: "invalid_data_files" });
        return;
      }

      /*
       * Политика проверяется до записи: файл с опечаткой уронил бы загрузку
       * набора на ноде целиком, и узнать об этом из панели было бы уже негде.
       */
      let policy: ModsecPolicy | undefined;

      if (body.policy !== undefined) {
        try {
          policy = validatePolicy(body.policy);
        } catch (err) {
          res.status(400).json({
            error: "invalid_policy",
            detail: err instanceof PolicyError ? err.message : String(err),
          });

          return;
        }
      }

      if (name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      /*
       * Переименовать default нельзя: объявление без `profile=` ищет профиль
       * по этому имени, и переименование оставило бы поколение без точки
       * опоры -- ровно то же, что удаление. Само содержимое правится: default
       * -- рабочая политика пространства, а не запертый образец. Чем он
       * поставлен и как вернуть его назад -- `default-profile.ts`.
       */
      if (isDefaultRename(existing.name, name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }

      if (files === "bad") {
        res.status(400).json({ error: "invalid_files" });
        return;
      }

      const row = await dispatch(
        updateRuleSet({ id, patch: { name, description, files, dataFiles, policy } }),
      ).unwrap();

      log("info", "rule set updated", {
        uuid: row.id,
        name: row.name,
        files: row.files.length,
      });

      res.json(jsonRuleSet(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /*
   * Вернуть default к поставке -- к составу из schema/02-seed.sql.
   * Файлы ищутся по именам: uuid у каждой установки свои, а имя -- то, чем
   * набор описан в `compile/rule-set-seed.ts`.
   *
   * Файла может не оказаться -- его снесли из каталога. Восстановление ставит
   * то, что нашлось, и называет недостающее: набор без единого файла роняет
   * рендер манифеста, поэтому пустой состав -- отказ, а не тихая запись.
   */
  router.post("/:uuid/restore", async (req: Request, res: Response, next) => {
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

      const existing = ruleSetSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (existing.name !== DEFAULT_PROFILE) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const catalog = new Map(
        selectRuleFilesInSpace(getState(), scope).map((file) => [file.name, file.id]),
      );
      const files = DEFAULT_RULE_SET_BASELINE.files
        .map((name) => catalog.get(name))
        .filter((fileId) => fileId !== undefined);
      const missing = DEFAULT_RULE_SET_BASELINE.files.filter(
        (name) => !catalog.has(name),
      );

      if (files.length === 0) {
        res.status(409).json({ error: "baseline_files_gone", detail: missing.join(", ") });
        return;
      }

      const row = await dispatch(
        updateRuleSet({
          id,
          patch: {
            description: DEFAULT_RULE_SET_BASELINE.description,
            files,
            dataFiles: DEFAULT_RULE_SET_BASELINE.dataFiles,
            policy: normalizePolicy(null),
          },
        }),
      ).unwrap();

      log("info", "rule set restored", {
        uuid: row.id,
        name: row.name,
        files: row.files.length,
        missing: missing.length,
      });

      res.json({ ...jsonRuleSet(row), missing_files: missing });
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

      const existing = ruleSetSelectors.selectById(getState(), id);

      if (existing === undefined || existing.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      /*
       * Манифест без default не собирается (`missing_default`), поэтому отказ
       * здесь, а не после send -- как у калитки.
       */
      if (existing.name === DEFAULT_PROFILE) {
        res.status(409).json({ error: "default_required" });
        return;
      }

      const uses = profileUses(getState(), scope, "modsec", existing.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      const row = await dispatch(deleteRuleSet({ id })).unwrap();

      log("info", "rule set deleted", { uuid: row.id, name: row.name });
      res.json(jsonRuleSet(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
