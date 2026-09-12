import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

/**
 * Прокси к waf-search. UX ходит в тот же origin `/api`, ClickHouse, Redis и
 * :8091 с браузера не торчат.
 *
 * Форму ответа контроллер не трогает: он не знает ни про фазы, ни про находки,
 * ни про локаторы обменника, и разбирать чужую схему по дороге значило бы менять
 * два сервиса на каждое новое поле. Его работа — граница сети и один понятный
 * ответ на «поиска нет»: пустой URL или недоступный процесс превращаются в 503
 * с кодом, по которому UX отличает «ничего не нашлось» от «искать негде».
 */

/**
 * Разворот одной записи. Список закрытый, а не «всё, что после /audit»: прокси
 * не должен уметь дотянуться до того, чего в waf-search ещё нет.
 *
 * `findings` рядом с `inspectors` — то же самое без разбора по участникам, для
 * выгрузки. `headers`, `args` и `body` ходят уже не в ClickHouse, а в обменник.
 */
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

      /*
       * Ушёл клиент -- уходит и запрос к поиску. UX снимает свой fetch на
       * каждый новый клик по фильтру, и без этого брошенный запрос дочитывал
       * окно в ClickHouse до конца: следующий клик ждал, пока два ядра доедят
       * чужие сканы. waf-search отменяет запрос в ClickHouse по контексту
       * соединения, так что оборванный здесь fetch останавливает и чтение.
       */
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

  // Группы того же фильтра (?by=ip,uri). С маршрутом :node/:ray не спорит —
  // тому нужны два сегмента.
  router.get("/audit/groups", forward((req) => `/api/audit/groups${search(req.url)}`));

  router.get("/findings", forward((req) => `/api/findings${search(req.url)}`));

  /*
   * Журнал процессов ноды. Тот же прокси и тот же 503, но ресурс другой:
   * строка access_log или error_log к записи запроса не привязана, разворота
   * у неё нет, и в /audit её положить некуда.
   *
   * facets отдельно: списки для фильтров считаются группировкой по окну и
   * меняются на порядок реже, чем сами строки.
   */
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
    // Ошибка до маршрутизатора waf-search приезжает text/plain.
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
