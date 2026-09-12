import { Router } from "express";

import type { Pool } from "./db.ts";
import { scopeOf } from "./scope.ts";

/**
 * `GET /api/:scope/catalog` -- всё, на что настройки маршрута ссылаются по
 * имени, одним ответом.
 *
 * Имена в `WafRouteSettings` -- строки, как в nginx (`waf_deny_response_default
 * blocked`, `waf_local_check ip_block …`). Пока их набирают руками, опечатка
 * ловится либо компиляцией (только у инспекторов), либо на ноде при `nginx -t`,
 * либо не ловится вовсе. Форма должна выбирать из списка, а списку неоткуда
 * взяться: у `deny_responses` и `log_formats` своих маршрутов нет, а ходить в
 * пять разных ради одной формы -- пять запросов на открытие карточки.
 *
 * Здесь только то, что нужно селекту: имя и минимум для подписи. Полные
 * карточки живут на своих страницах.
 */
export interface CatalogBundle {
  deny_responses: { name: string; type: string; status?: number; page?: string }[];
  log_formats: { name: string; kind: "nginx"; summary: string }[];
  datasets: {
    name: string;
    kind: string;
    type: string;
    active: boolean;
    /** Слот в шаблоне nginx. false -- набор компилятора, не для waf_local_check. */
    in_nginx: boolean;
    /**
     * Срок overlay набора, как `ttl=5m`. Нужен там, где на набор ссылаются:
     * автобан `waf_local_rate list=` без своего `ttl=` берёт этот, а если его
     * нет ни там, ни здесь -- строка не собирается.
     */
    ttl?: string;
    /** `hash=md5`: состав -- md5 значений; панель показывает это у набора. */
    hash?: boolean;
  }[];
  inspectors: { name: string; subject: string; phases: string[] }[];
  /**
   * Темы, под которыми уже объявлен хоть один инспектор. Из них выбирают,
   * когда заводят второе имя на тот же процесс: `allow_ip` и `strict_ip` --
   * один `waf.req.ip`, разный `profile=` (docs/directives/list/inspector.md).
   */
  subjects: string[];
  /**
   * Профили, которые понимает инспектор. «Какие профили есть, решает
   * инспектор», поэтому это подсказка, а не закрытый список.
   *
   * `kind` -- сервис инспектора, то есть последнее звено темы: `waf.req.ip`
   * -- `ip`, `waf.req.action` -- `action`. Так же его берут остальные места
   * панели (`serviceOf` в словаре действий): у одного сервиса в реестре
   * несколько имён (`ip-ext`, `ip-admin`), и профили у них общие.
   *
   * Здесь перечислены все таблицы профилей контура. Сервис, у которого своей
   * таблицы нет, в списке просто не встречается -- реестр покажет пустой
   * список и оставит поле свободным вводом.
   */
  profiles: { name: string; kind: string }[];
  response_pages: { name: string }[];
  body_stores: { name: string; driver: string }[];
  upstreams: { uuid: string; name: string }[];
}

export function catalogRouter(pool: Pool): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const [deny, formats, datasets, inspectors, pages, stores, upstreams, profiles] =
        await Promise.all([
          pool.query(
            `select name, type, spec from deny_responses
              where http_space_id = $1 order by position, name`,
            [scope],
          ),
          pool.query(
            `select name, coalesce(kind, 'waf') as kind, fields, coalesce(format, '') as format
               from log_formats where http_space_id = $1 order by name`,
            [scope],
          ),
          pool.query(
            `select name, kind, type, active, coalesce(in_nginx, false) as in_nginx,
                    ttl, coalesce(hash, false) as hash
               from datasets where http_space_id = $1 order by name`,
            [scope],
          ),
          pool.query(
            `select name, subject, phases from inspectors
              where http_space_id = $1 order by position, name`,
            [scope],
          ),
          pool.query(
            `select name from datasets
              where http_space_id = $1 and kind = 'content' order by name`,
            [scope],
          ),
          pool.query(
            `select name, driver from body_stores
              where http_space_id = $1 order by position, name`,
            [scope],
          ),
          pool.query(
            `select id, name from upstreams where http_space_id = $1 order by name`,
            [scope],
          ),
          /*
           * Профили всех сервисов одним запросом: реестр инспекторов выбирает
           * из них по теме объявления. Таблицы разные, но `name` и
           * `http_space_id` есть у каждой -- список собирается объединением.
           */
          pool.query(
            `select name, 'modsec' as kind from rule_sets where http_space_id = $1
             union all
             select name, 'ip' as kind from ip_profiles where http_space_id = $1
             union all
             select name, 'auth' as kind from auth_profiles where http_space_id = $1
             union all
             select name, 'captcha' as kind from captcha_profiles where http_space_id = $1
             union all
             select name, 'json' as kind from json_profiles where http_space_id = $1
             union all
             select name, 'action' as kind from action_profiles where http_space_id = $1
             union all
             select name, 'counter' as kind from counter_profiles where http_space_id = $1
             union all
             select name, 'vlai' as kind from vlai_profiles where http_space_id = $1
             union all
             select name, 'rewrite' as kind from rewrite_profiles where http_space_id = $1
             order by kind, name`,
            [scope],
          ),
        ]);

      const bundle: CatalogBundle = {
        deny_responses: deny.rows.map((r) => {
          const spec = (r.spec ?? {}) as { status?: number; page?: string };
          const row: CatalogBundle["deny_responses"][number] = {
            name: r.name,
            type: r.type ?? "http",
          };
          if (typeof spec.status === "number") row.status = spec.status;
          if (typeof spec.page === "string") row.page = spec.page;
          return row;
        }),
        log_formats: formats.rows.map((r) => ({
          name: r.name,
          kind: "nginx" as const,
          summary: String(r.format ?? ""),
        })),
        datasets: datasets.rows.map((r) => ({
          name: r.name,
          kind: r.kind ?? "list",
          type: r.type ?? "string",
          active: r.active === true,
          in_nginx: r.in_nginx === true,
          ...(typeof r.ttl === "string" && r.ttl !== "" ? { ttl: r.ttl } : {}),
          ...(r.hash === true ? { hash: true } : {}),
        })),
        inspectors: inspectors.rows.map((r) => ({
          name: r.name,
          subject: r.subject,
          phases: r.phases ?? ["request"],
        })),
        subjects: [...new Set(inspectors.rows.map((r) => String(r.subject)))].sort(),
        profiles: profiles.rows.map((r) => ({ name: r.name, kind: String(r.kind) })),
        response_pages: pages.rows.map((r) => ({ name: r.name })),
        body_stores: stores.rows.map((r) => ({ name: r.name, driver: r.driver })),
        upstreams: upstreams.rows.map((r) => ({ uuid: r.id, name: r.name })),
      };

      res.json(bundle);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
