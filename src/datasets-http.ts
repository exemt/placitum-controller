import { Router } from "express";
import type { Request, Response } from "express";

import type { DatasetSetLink, DatasetRepo } from "./datasets.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import {
  parseDatasetEntries,
  parseUploadLines,
} from "./dataset-entry.ts";
import type {
  ContentType,
  Dataset,
  DatasetAddress,
  DatasetContent,
} from "./model/http-space.ts";
import {
  DEFAULT_DATASET_KIND,
  DEFAULT_DATASET_TYPE,
  isDatasetKind,
  isDatasetType,
} from "./model/http-space.ts";
import { asUuid } from "./model/id.ts";
import { parseNginxTimeS } from "./nginx-time.ts";
import { scopeOf } from "./scope.ts";
import {
  datasetSelectors,
  selectDatasetsInSpace,
} from "./state/slices/datasets.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import {
  addAddresses,
  createDataset,
  deleteDataset,
  putContent,
  removeAddress,
  updateDataset,
} from "./state/thunks/datasets.ts";
import { datasetWafUses, usesDetail } from "./usage.ts";

function jsonProfileLink(link: DatasetSetLink) {
  return {
    uuid: link.setId,
    name: link.name,
    exclude: link.exclude,
  };
}

function jsonDataset(row: Dataset, links: DatasetSetLink[] = []) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    type: row.type,
    content_type_id: row.contentTypeId ?? null,
    max_entries: row.maxEntries,
    limit: row.maxEntries,
    active: row.active,
    mode: row.active ? "active" : "internal",
    builtin: row.builtin === true,
    in_nginx: row.inNginx === true,
    ttl: row.ttl ?? null,
    hash: row.hash === true,
    size: row.size,
    /*
     * Что читает страница: имена переменных из её тела. Панели это нужно
     * там, где у записи отказа выбирают `params=` -- перечень и шаблон друг
     * о друге не знают. У наборов-списков поля нет, а не пустой массив:
     * "нечего разбирать" и "разобрали, ничего не нашли" -- разные ответы.
     */
    vars: row.vars ?? null,
    linked: links.length > 0,
    linked_sets: links.map(jsonProfileLink),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function jsonDatasetOf(
  repo: DatasetRepo,
  row: Dataset,
): Promise<ReturnType<typeof jsonDataset>> {
  return jsonDataset(row, await repo.profileLinksOf(row.id));
}

function jsonContentType(row: ContentType) {
  return {
    uuid: row.id,
    name: row.name,
    mime: row.mime,
    description: row.description,
  };
}

function jsonContent(row: DatasetContent) {
  return {
    dataset_id: row.datasetId,
    name: row.name,
    size: row.size,
    blob: row.body.toString("base64"),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function jsonAddress(row: DatasetAddress) {
  return {
    uuid: row.id,
    dataset_id: row.datasetId,
    address: row.address,
    ttl_s: row.ttlS,
    expires_at: row.expiresAt?.toISOString() ?? null,
    origin: row.origin,
    reason: row.reason,
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

function parseMode(body: { mode?: unknown; active?: unknown }): "active" | "internal" | undefined | "bad" {
  if (body.mode === "active" || body.mode === "internal") {
    return body.mode;
  }
  if (body.mode !== undefined) {
    return "bad";
  }
  const active = parseBool(body.active);
  if (active === "bad") {
    return "bad";
  }
  if (active === true) {
    return "active";
  }
  if (active === false) {
    return "internal";
  }
  return undefined;
}

function parseBool(value: unknown): boolean | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    return "bad";
  }

  return value;
}

function parseListTtl(value: unknown): string | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return "bad";
  }

  const spec = value.trim();
  if (spec.length === 0) {
    return undefined;
  }

  return parseNginxTimeS(spec) === undefined ? "bad" : spec;
}

function parseTtl(value: unknown): number | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return "bad";
  }

  return value;
}

function parseMax(value: unknown): number | undefined | "bad" {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return "bad";
  }

  return value;
}

function parseAddressList(body: {
  address?: unknown;
  addresses?: unknown;
  text?: unknown;
}): string[] | "bad" {
  if (typeof body.address === "string") {
    const address = body.address.trim();
    return address.length === 0 ? "bad" : [address];
  }

  if (typeof body.text === "string") {
    const lines = parseUploadLines(body.text);
    return lines.length === 0 ? "bad" : lines;
  }

  if (!Array.isArray(body.addresses)) {
    return "bad";
  }

  const addresses: string[] = [];

  for (const item of body.addresses) {
    if (typeof item !== "string") {
      return "bad";
    }

    const address = item.trim();

    if (address.length === 0) {
      return "bad";
    }

    addresses.push(address);
  }

  return addresses.length === 0 ? "bad" : addresses;
}

function datasetInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): Dataset | undefined {
  const row = datasetSelectors.selectById(getState(), id);

  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }

  return row;
}

export function contentTypesRouter(repo: DatasetRepo): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await repo.listContentTypes();
      res.json({ content_types: rows.map(jsonContentType) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function datasetsRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: DatasetRepo,
  maxBytes: number,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const links = await repo.listProfileLinks(scope);
      /*
       * Модель в памяти знает размер с гидрации; у активного набора он
       * растёт у keeper без участия контроллера -- берётся из Redis.
       */
      const rows = await repo.withLiveSizes(
        selectDatasetsInSpace(getState(), scope).map((row) => ({ ...row })),
      );
      res.json({
        datasets: rows.map((row) => jsonDataset(row, links.get(row.id) ?? [])),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const body = req.body as {
        name?: unknown;
        description?: unknown;
        kind?: unknown;
        type?: unknown;
        content_type_id?: unknown;
        max_entries?: unknown;
        limit?: unknown;
        active?: unknown;
        mode?: unknown;
        ttl?: unknown;
        entries?: unknown;
        in_nginx?: unknown;
        /** `hash=md5`: только у списка строк. */
        hash?: unknown;
        /** UUID набора, чей состав скопировать в новый. */
        copy_from?: unknown;
      };

      const spaceId = scopeOf(req);

      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const name = parseName(body.name);

      if (name === undefined || name === "bad") {
        res.status(400).json({ error: "invalid_name" });
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

      const mode = parseMode(body);

      if (mode === undefined || mode === "bad") {
        res.status(400).json({ error: "invalid_mode" });
        return;
      }


      if (mode === "internal" && body.ttl !== undefined) {
        res.status(400).json({ error: "ttl_internal" });
        return;
      }

      if (
        mode === "active" &&
        Array.isArray(body.entries) &&
        body.entries.length > 0
      ) {
        res.status(400).json({ error: "entries_active" });
        return;
      }


      const kind =
        body.kind === undefined
          ? DEFAULT_DATASET_KIND
          : typeof body.kind === "string" && isDatasetKind(body.kind)
            ? body.kind
            : null;

      if (kind === null) {
        res.status(400).json({ error: "invalid_kind" });
        return;
      }

      const type =
        kind === "content"
          ? DEFAULT_DATASET_TYPE
          : body.type === undefined
            ? DEFAULT_DATASET_TYPE
            : typeof body.type === "string" && isDatasetType(body.type)
              ? body.type
              : null;

      if (type === null) {
        res.status(400).json({ error: "invalid_type" });
        return;
      }

      let contentTypeId: string | undefined;

      if (kind === "content") {
        const id =
          typeof body.content_type_id === "string"
            ? asUuid(body.content_type_id)
            : undefined;

        if (id === undefined) {
          res.status(400).json({ error: "invalid_content_type" });
          return;
        }

        if ((await repo.getContentType(id)) === null) {
          res.status(400).json({ error: "unknown_content_type" });
          return;
        }

        contentTypeId = id;
      } else if (body.content_type_id !== undefined) {
        res.status(400).json({ error: "content_type_list_forbidden" });
        return;
      }

      const maxEntries = parseMax(body.limit ?? body.max_entries);

      if (maxEntries === "bad") {
        res.status(400).json({ error: "invalid_max_entries" });
        return;
      }

      if (kind === "content" && mode === "active") {
        res.status(400).json({ error: "active_list_only" });
        return;
      }

      const listTtl = parseListTtl(body.ttl);

      if (listTtl === "bad") {
        res.status(400).json({ error: "invalid_ttl" });
        return;
      }

      // Хешируются только строки: адресу и числу md5 ничего не даёт.
      if (body.hash !== undefined && typeof body.hash !== "boolean") {
        res.status(400).json({ error: "invalid_hash" });
        return;
      }

      if (body.hash === true && (kind !== "list" || type !== "string")) {
        res.status(400).json({ error: "hash_string_only" });
        return;
      }

      const row = await dispatch(
        createDataset({
          httpSpaceId: spaceId,
          name,
          description,
          kind,
          type,
          contentTypeId,
          maxEntries: maxEntries ?? 1_000_000,
          active: kind === "list" && mode === "active",
          ttl: mode === "active" ? listTtl : undefined,
          // Список локального слоя заводят на странице http; наборы
          // ip-компилятора приходят своим путём и слотом не становятся.
          inNginx: body.in_nginx === true,
          hash: body.hash === true,
        }),
      ).unwrap();

      // Начальный состав из готового набора: новый список редко начинают
      // с чистого листа. Промах источника не отменяет создание -- список уже
      // заведён, и откатывать его из-за пустой копии хуже, чем сказать сколько
      // записей приехало.
      let copied = 0;
      if (typeof body.copy_from === "string" && body.copy_from !== "") {
        const source = datasetInScope(getState, body.copy_from, spaceId);
        // Хешированный и сырой состав не смешиваются: копия только между
        // наборами с одинаковым hash.
        if (
          source !== undefined &&
          source.kind === "list" &&
          source.type === row.type &&
          (source.hash === true) === (row.hash === true)
        ) {
          copied = await repo.copyAddresses(source.id, row.id);
        }
      }

      log("info", "dataset created", { uuid: row.id, name: row.name, copied });
      res.status(201).json({ ...jsonDataset(row), copied });
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/:uuid/addresses", async (req, res, next) => {
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

      if (datasetInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const rows = await repo.listAddresses(id, q);

      if (rows === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (rows === "wrong_kind") {
        res.status(400).json({ error: "wrong_kind" });
        return;
      }

      res.json({ addresses: rows.map(jsonAddress) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:uuid/addresses", async (req: Request, res: Response, next) => {
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

      const dataset = datasetInScope(getState, id, scope);

      if (dataset === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (dataset.kind !== "list") {
        res.status(400).json({ error: "wrong_kind" });
        return;
      }

      const addresses = parseAddressList(req.body as {
        address?: unknown;
        addresses?: unknown;
        text?: unknown;
      });

      if (addresses === "bad") {
        res.status(400).json({ error: "invalid_address" });
        return;
      }

      const parsed = parseDatasetEntries(dataset.type, addresses);

      if (!parsed.ok) {
        res.status(400).json({
          error: "invalid_address",
          invalid: parsed.invalid,
        });
        return;
      }

      const ttlS = parseTtl((req.body as { ttl_s?: unknown }).ttl_s);

      if (ttlS === "bad") {
        res.status(400).json({ error: "invalid_ttl" });
        return;
      }

      const result = await dispatch(
        addAddresses({
          datasetId: id,
          addresses: parsed.entries,
          ttlS,
        }),
      ).unwrap();

      log("info", "dataset addresses added", {
        dataset: id,
        count: result.addresses.length,
      });

      res.status(201).json({ addresses: result.addresses.map(jsonAddress) });
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.get("/:uuid/content", async (req, res, next) => {
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

      if (datasetInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await repo.getContent(id);

      if (row === "wrong_kind") {
        res.status(400).json({ error: "wrong_kind" });
        return;
      }

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonContent(row));
    } catch (err) {
      next(err);
    }
  });

  router.put("/:uuid/content", async (req: Request, res: Response, next) => {
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

      const target = datasetInScope(getState, id, scope);

      if (target === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // Тело встроенной страницы -- часть поставки, как файл в образе.
      if (target.builtin === true) {
        res.status(400).json({ error: "builtin_locked" });
        return;
      }

      const body = req.body as { name?: unknown; blob?: unknown };
      const name = typeof body.name === "string" ? body.name.trim() : "";

      if (typeof body.blob !== "string" || body.blob.length === 0) {
        res.status(400).json({ error: "blob_required" });
        return;
      }

      let blob: Buffer;

      try {
        blob = Buffer.from(body.blob, "base64");
      } catch {
        res.status(400).json({ error: "blob_not_base64" });
        return;
      }

      if (blob.length === 0) {
        res.status(400).json({ error: "blob_empty" });
        return;
      }

      if (blob.length > maxBytes) {
        res.status(413).json({ error: "blob_too_large", max: maxBytes });
        return;
      }

      const result = await dispatch(
        putContent({ datasetId: id, name, body: blob }),
      ).unwrap();

      log("info", "dataset content put", {
        dataset: id,
        size: result.content.size,
      });

      res.json(jsonContent(result.content));
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

      const row = datasetInScope(getState, id, scope);

      if (row === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const [live] = await repo.withLiveSizes([{ ...row }]);

      res.json(await jsonDatasetOf(repo, live));
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

      if (datasetInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        kind?: unknown;
        type?: unknown;
        content_type_id?: unknown;
        max_entries?: unknown;
        limit?: unknown;
        active?: unknown;
        mode?: unknown;
        ttl?: unknown;
        in_nginx?: unknown;
        hash?: unknown;
      };

      const name = parseName(body.name);
      const description = parseText(body.description);
      const maxEntries = parseMax(body.limit ?? body.max_entries);
      const mode = parseMode(body);
      const active =
        mode === "active" ? true : mode === "internal" ? false : parseBool(body.active);

      if (name === "bad") {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      if (description === "bad") {
        res.status(400).json({ error: "invalid_description" });
        return;
      }


      if (body.type !== undefined) {
        res.status(400).json({ error: "type_immutable" });
        return;
      }

      if (body.kind !== undefined) {
        res.status(400).json({ error: "kind_immutable" });
        return;
      }

      if (body.content_type_id !== undefined) {
        res.status(400).json({ error: "content_type_immutable" });
        return;
      }

      if (maxEntries === "bad") {
        res.status(400).json({ error: "invalid_max_entries" });
        return;
      }

      if (mode === "bad" || active === "bad") {
        res.status(400).json({ error: "invalid_mode" });
        return;
      }

      const current = datasetInScope(getState, id, scope);

      /*
       * Встроенная страница (content) заперта целиком: поставочный образец,
       * от которого отталкиваются копией, а не объект настройки. Правленый
       * образец перестаёт быть образцом.
       *
       * Встроенный список заперт только именем: на имя ссылаются пресеты, а
       * состав, лимит и режим -- рабочее состояние, его правят.
       */
      if (current?.builtin === true && current.kind === "content") {
        res.status(400).json({ error: "builtin_locked" });
        return;
      }

      if (current?.builtin === true && name !== undefined && name !== current.name) {
        res.status(400).json({ error: "builtin_name_locked" });
        return;
      }

      const nextActive =
        active === undefined ? current?.active : active;

      if (current !== undefined && current.kind !== "list" && nextActive === true) {
        res.status(400).json({ error: "active_list_only" });
        return;
      }


      if (nextActive === false && body.ttl !== undefined) {
        res.status(400).json({ error: "ttl_internal" });
        return;
      }

      const listTtl = parseListTtl(body.ttl);

      if (listTtl === "bad") {
        res.status(400).json({ error: "invalid_ttl" });
        return;
      }

      // Флаг объявления в шаблоне. Только у списков: содержимым слот
      // `waf_local_dataset` не бывает.
      if (body.in_nginx !== undefined && typeof body.in_nginx !== "boolean") {
        res.status(400).json({ error: "invalid_in_nginx" });
        return;
      }

      if (body.in_nginx === true && current !== undefined && current.kind !== "list") {
        res.status(400).json({ error: "in_nginx_list_only" });
        return;
      }

      /*
       * hash=md5: только у списка строк, и только пока набор пуст. Записи,
       * положенные сырыми, после смены флага не совпали бы ни разу, а
       * положенные хешами -- стали бы нечитаемым мусором; состав сначала
       * чистят, потом переключают.
       */
      if (body.hash !== undefined && typeof body.hash !== "boolean") {
        res.status(400).json({ error: "invalid_hash" });
        return;
      }

      const hashChanged =
        body.hash !== undefined && current !== undefined && body.hash !== (current.hash === true);

      if (hashChanged && (current.kind !== "list" || current.type !== "string")) {
        res.status(400).json({ error: "hash_string_only" });
        return;
      }

      if (hashChanged && current.size > 0) {
        res.status(400).json({ error: "hash_locked" });
        return;
      }

      const row = await dispatch(
        updateDataset({
          id,
          patch: {
            name,
            description,
            maxEntries,
            active,
            ttl: nextActive === false ? null : listTtl,
            inNginx: body.in_nginx as boolean | undefined,
            hash: hashChanged ? (body.hash as boolean) : undefined,
          },
        }),
      ).unwrap();

      log("info", "dataset updated", { uuid: row.id, name: row.name });
      res.json(await jsonDatasetOf(repo, row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /*
   * Снять набор можно только свободным: ссылки живут и в базе (наборы адресов,
   * правила ip-профилей, документы профилей подсистем), и в waf-документах
   * трёх уровней (локальный слой, if-условия) -- занятый набор отвечает 409
   * списком мест, а FK restrict остаётся страховкой от гонки.
   */
  router.delete("/:uuid", async (req, res, next) => {
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

      const current = datasetInScope(getState, id, scope);

      if (current === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // Встроенную страницу удалить нельзя: она приехала с поставкой, а
      // каталог на ноде заменяется целиком -- убранная из пространства
      // исчезла бы и с ноды, оставив отказ без страницы. Ненужную не удаляют,
      // а просто не называют ни в одной записи каталога.
      if (current.builtin === true) {
        res.status(400).json({ error: "builtin_locked" });
        return;
      }

      const uses = [
        ...(await repo.referenceUses(id, current.name, scope)),
        ...datasetWafUses(getState(), scope, current.name),
      ];

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      const row = await dispatch(deleteDataset({ id })).unwrap();

      log("info", "dataset deleted", { uuid: row.id, name: row.name });
      res.json(jsonDataset(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}

export function addressesRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  repo: DatasetRepo,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (typeof req.query.address !== "string" || req.query.address.trim().length === 0) {
        res.status(400).json({ error: "address_required" });
        return;
      }

      const rows = await repo.findAddresses(req.query.address.trim(), scope);
      res.json({ addresses: rows.map(jsonAddress) });
    } catch (err) {
      next(err);
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

      const row = await repo.getAddress(id);

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (datasetInScope(getState, row.datasetId, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonAddress(row));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:uuid", async (req, res, next) => {
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

      const existing = await repo.getAddress(id);

      if (
        existing === null ||
        datasetInScope(getState, existing.datasetId, scope) === undefined
      ) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const result = await dispatch(removeAddress({ addressId: id })).unwrap();
      res.json(jsonAddress(result.address));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}
