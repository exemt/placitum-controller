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

/**
 * CRUD трёх каталогов http {}: `waf_deny_response`, `waf_store`,
 * `log_format`.
 *
 * Проверки здесь -- те же, что дал бы `nginx -t` на ноде, только раньше:
 * статус ответа отказа вне 4xx/5xx превращает блокировку в тихий пропуск,
 * второй обменник -- ошибка компиляции, а формат nginx с одинарной кавычкой
 * внутри не печатается вовсе. Ловить это на флоте дороже, чем в форме.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function badName(name: unknown): boolean {
  return typeof name !== "string" || !CATALOG_NAME_RE.test(name);
}

function jsonDeny(row: DenyResponse) {
  return { uuid: row.id, name: row.name, type: row.type, spec: row.spec };
}

/**
 * `url` в ответе -- не поле записи, а то, с чем поднят контроллер: панель
 * показывает адрес обменника, но не правит его (см. parseStore).
 */
function jsonStoreWith(url: string) {
  return (row: BodyStore) => {
    // Адрес, сохранённый в spec до переноса: панель его не показывает и не
    // возвращает обратно, иначе первая же правка сроков вернула бы его в базу.
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

/** 2xx и 3xx в ответе отказа делают блокировку неотличимой от пропуска. */
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

  /*
   * `message=` осталось у grpc и websocket -- там это единственный способ
   * что-то сказать. У http его нет: текст отказа -- свойство страницы, и
   * второе место, где та же фраза лежит, разошлось бы с ней молча.
   *
   * Присланное поле у http не отвергается, а отбрасывается: панель шлёт
   * запись целиком, и строка с давним `message` иначе перестала бы
   * сохраняться вовсе -- вместе со статусом и перечнем, которые правят.
   */
  if (type !== "http") {
    const value = raw.message;
    if (typeof value === "string" && value.trim() !== "") {
      spec.message = value.trim();
    }
  }

  /*
   * Перечень того, что запись отдаёт клиенту. Слово мимо словаря -- отказ, а
   * не пропуск: перечень пишут ради того, чтобы наружу не ушло лишнее, и
   * опечатка, молча открывшая всё, была бы ровно той дырой, от которой его
   * заводили. Пустой список равен незаданному -- в панели это одно состояние
   * «отдаётся всё», и хранить его двумя формами значило бы различать
   * неразличимое.
   */
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

/**
 * Из обменника панель задаёт только сроки и пределы.
 *
 * Драйвер и адрес сюда не принимаются даже присланными: `url=` -- одно из трёх
 * объявлений одного redis (модуль, агент, инспекторы), и правка только этого
 * развела бы их; драйверы `none` / `inline` на горячем пути не участвуют и
 * ломают `nginx -t` первому же маршруту со снимком. Оба печатаются из
 * окружения контроллера, см. emitBodyStores.
 *
 * Реквизиты redis тоже не отсюда: их несёт сам адрес
 * (`redis://user:pass@host`), а он -- свойство развёртывания.
 */
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
    // Присланные url / driver не ошибка формы, а старый клиент: молча мимо.
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
    // Экранировать одинарную кавычку внутри `log_format …'…'` нечем.
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

/** Отказ до записи: статус и тело вместо изменения. */
type Veto = { status: number; body: unknown };

/** Один маршрутизатор на три каталога: различаются разбором и именем поля. */
function catalogRouterFor<T, I>(
  repo: Repo<T, I>,
  parse: (body: unknown) => I | string,
  toJson: (row: T, scope: string) => unknown,
  key: string,
  opts: {
    remove?: boolean;
    /** GET: собрать строки списком (занятость считается на весь список разом). */
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

/** Имя в контуре уникально: 23505 -- не сбой, а занятое имя. */
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

/**
 * Именем записи её держат `waf_deny_response_default`, пороги счёта и
 * `response=` локального слоя. Снять или переименовать занятую значит
 * оставить ссылки на несуществующее: сборка всего контура падает на
 * `unknown_deny_response`. Поэтому 409 со списком мест, как у наборов и
 * профилей, а занятость едет с каждой строкой -- панель гасит корзинку,
 * не дожидаясь отказа.
 */
export function denyResponsesRouter(pool: Pool, getState: () => RootState): Router {
  const repo = new DenyResponseRepo(pool);

  const rowIn = async (scope: string, id: string) =>
    (await repo.list(scope)).find((row) => row.id === id);

  // Полная занятость имени: waf-документы трёх уровней из стора плюс
  // профили подсистем и правила ip из базы.
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
    // POST/PUT: без занятости -- свежую посчитает следующий GET, а свежее
    // созданную запись никто держать не успел.
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
        // Правка на месте (код, тело, params=) ссылок не рвёт -- отказ только смене имени.
        if (current === undefined || current.name === input.name) return undefined;
        return veto(await usesOf(scope, current.name));
      },
      beforeRemove: async (scope, id) => {
        const current = await rowIn(scope, id);
        if (current === undefined) return undefined; // 404 отдаст remove
        return veto(await usesOf(scope, current.name));
      },
    },
  );
}

/**
 * Обменника `remove` нет: строка одна на контур, и снятие её -- не настройка, а
 * поломка снимка и архива у всех маршрутов сразу. Завести недостающую панель
 * по-прежнему может.
 */
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
