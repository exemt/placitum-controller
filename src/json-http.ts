/*
 * API профилей контракта. Устроен как captcha-http: роутер ходит в репозиторий
 * напрямую, профили в сборке nginx.conf не участвуют.
 *
 * Две проверки сверх формы документа делаются здесь, потому что делать их в
 * доке нечем -- обе смотрят в базу: спецификация обязана существовать объектом
 * содержимого этого пространства, а имя записи каталога отказов -- в каталоге.
 * Обе ошибки иначе всплыли бы как apply_failed в пульсе через минуту после
 * send, а туда никто не смотрит, пока трафик идёт.
 */

import { Router } from "express";
import type { Request, Response } from "express";

import { buildJsonManifest } from "./json-manifest.ts";
import { DocError, normalizeDoc, validateDoc } from "./json-profile-doc.ts";
import type { JsonProfileRepo } from "./json-profiles.ts";
import {
  DEFAULT_DOC_BASELINE,
  DEFAULT_PROFILE_NAME,
  docDiffersFromBaseline,
  isDefaultRename,
} from "./default-profile.ts";
import type { DesiredStore } from "./desired.ts";
import type { InspectorSettingsSource } from "./inspector-settings.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { JsonProfile, JsonProfileDoc } from "./model/json-profile.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { profileUses, usesDetail } from "./usage.ts";

const NAME_RE = /^[a-z_][a-z0-9_-]{0,63}$/;

function jsonProfile(row: JsonProfile) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    source: row.source,
    doc: row.doc,
    modified:
      row.name === DEFAULT_PROFILE_NAME &&
      docDiffersFromBaseline(row.description, row.doc, normalizeDoc),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function badName(value: unknown): boolean {
  return typeof value !== "string" || !NAME_RE.test(value);
}

export function jsonRouter(
  getState: () => RootState,
  repo: JsonProfileRepo,
  desired: DesiredStore,
  settingsOf: InspectorSettingsSource,
): Router {
  const router = Router({ mergeParams: true });

  /* --- профили ----------------------------------------------------------- */

  router.get("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ profiles: (await repo.list(scope)).map(jsonProfile) });
    } catch (err) {
      next(err);
    }
  });

  /*
   * Схемы профиля. Проверяются все сразу -- основная и названные привязками, --
   * потому что поколение собирается тоже целиком: профиль с одной потерянной
   * привязкой не поедет так же, как профиль без основного документа.
   */
  async function checkSchemas(
    scope: string,
    doc: JsonProfileDoc,
    res: Response,
  ): Promise<boolean> {
    const wanted = [doc.schema.source, ...doc.bindings.map((b) => b.schema)].filter(
      (id) => id !== "",
    );

    for (const id of new Set(wanted)) {
      const object = await repo.schemaObject(id, scope);

      if (object === null) {
        res.status(400).json({ error: "schema_not_found", detail: id });

        return false;
      }

      if (object.text.trim() === "") {
        res.status(400).json({ error: "schema_empty", detail: object.name });

        return false;
      }
    }

    return true;
  }

  /*
   * Имя записи каталога отказов. Модуль отдаёт по имени код и страницу, и
   * несуществующее имя означает отказ страницей по умолчанию -- то есть не то,
   * что задумал оператор, и без единого признака ошибки.
   */
  async function checkDenyResponses(
    scope: string,
    doc: JsonProfileDoc,
    res: Response,
  ): Promise<boolean> {
    const known = new Set(await repo.denyResponses(scope));

    const wanted: string[] = [];

    if (doc.request.enabled && doc.request.denyResponse !== "") {
      wanted.push(doc.request.denyResponse);
    }

    if (doc.response.enabled && doc.response.denyResponse !== "") {
      wanted.push(doc.response.denyResponse);
    }

    for (const name of wanted) {
      if (!known.has(name)) {
        res.status(400).json({
          error: "deny_response_unknown",
          detail: name,
          known: [...known],
        });

        return false;
      }
    }

    return true;
  }

  router.post("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = validateDoc(normalizeDoc(body.doc));

      if (!(await checkSchemas(scope, doc, res))) {
        return;
      }

      if (!(await checkDenyResponses(scope, doc, res))) {
        return;
      }

      const row = await repo.insert({
        httpSpaceId: scope,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "json profile created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.get("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await owned(req, res);

      if (row === null) {
        return;
      }

      /*
       * Отправители, которых нет в реестре контура: их просьбы не придут
       * никогда. Замечание, а не отказ -- реестр правят отдельно, и профиль,
       * написанный вперёд него, нормальный порядок работы.
       */
      const known = new Set(await repo.inspectorNames(row.httpSpaceId));
      const unknownSenders = [
        ...new Set(
          row.doc.trigger.prior
            .map((rule) => rule.from)
            .filter((from) => from !== "*" && !known.has(from)),
        ),
      ];

      const senderCodes = await repo.senderCodes(row.httpSpaceId);

      res.json({
        ...jsonProfile(row),
        unknown_senders: unknownSenders,
        sender_codes: senderCodes,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const current = await owned(req, res);

      if (current === null) {
        return;
      }

      const scope = current.httpSpaceId;

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && badName(body.name)) {
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
      if (isDefaultRename(current.name, body.name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      const doc =
        body.doc === undefined ? current.doc : validateDoc(normalizeDoc(body.doc));

      if (!(await checkSchemas(scope, doc, res))) {
        return;
      }

      if (!(await checkDenyResponses(scope, doc, res))) {
        return;
      }

      const row = await repo.update(current.id, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        doc: body.doc === undefined ? undefined : doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "json profile updated", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  /*
   * Вернуть default к поставке -- к тому, чем он пришёл из сида
   * 060_default_profiles.sql. Отдельная ручка, а не PUT с телом образца:
   * панель не обязана знать, чем профиль поставлен, образец держит
   * `default-profile.ts`, и возвращает его тот же, кто его держит.
   */
  router.post("/profiles/:uuid/restore", async (req: Request, res: Response, next) => {
    try {
      const current = await owned(req, res);

      if (current === null) {
        return;
      }

      /*
       * Возвращать к поставке нечего у своего профиля: он не приходил из
       * сида, и «как было» у него нет.
       */
      if (current.name !== DEFAULT_PROFILE_NAME) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const row = await repo.update(current.id, {
        description: DEFAULT_DOC_BASELINE.description,
        doc: validateDoc(normalizeDoc(DEFAULT_DOC_BASELINE.doc)),
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "json profile restored", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.delete("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await owned(req, res);

      if (row === null) {
        return;
      }

      /*
       * default удалить нельзя по той же причине, по которой его нельзя
       * переименовать: без него поколение не примет ни одна нода, и маршрут
       * без тега профиля останется без проверки.
       */
      if (row.name === "default") {
        res.status(400).json({ error: "default_is_required" });
        return;
      }

      // Профиль, названный с маршрута через profile=, оставил бы ссылку висеть.
      const uses = profileUses(getState(), row.httpSpaceId, "json", row.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      if (!(await repo.remove(row.id))) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "json profile deleted", { uuid: row.id, name: row.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- поколение ---------------------------------------------------------- */

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const manifest = await desired.getJson();

      if (manifest === null) {
        res.status(404).json({ error: "not_published" });
        return;
      }

      res.json(manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/send", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      /*
       * rev растёт на каждый успешный send и берётся из того, что уже лежит в
       * KV: контроллер историю поколений не хранит, а откат -- это повторный
       * send предыдущего состава.
       */
      const current = await desired.getJson();
      const built = await buildJsonManifest(repo, scope, (current?.rev ?? 0) + 1, settingsOf);

      if ("error" in built) {
        res.status(400).json(built);
        return;
      }

      await desired.putJson(built.manifest);

      log("info", "json sent", {
        space: scope,
        rev: built.manifest.rev,
        hash: built.manifest.config_hash,
        profiles: Object.keys(built.manifest.profiles),
      });

      res.json(built.manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- общее -------------------------------------------------------------- */

  async function owned(req: Request, res: Response): Promise<JsonProfile | null> {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return null;
    }

    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return null;
    }

    const row = await repo.get(id);

    if (row === null || row.httpSpaceId !== scope) {
      res.status(404).json({ error: "not_found" });
      return null;
    }

    return row;
  }

  return router;
}
