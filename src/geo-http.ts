import { isIP } from "node:net";

import { Router } from "express";

import type { IpAsnRepo } from "./ip-asns.ts";
import type { IpCountryRepo } from "./ip-countries.ts";
import { scopeOf } from "./scope.ts";

/**
 * Страна и ASN адреса для карточек в UX. Маршрут один -- пачка: карточка
 * копит запросы в общем контексте и шлёт их вместе, поэтому одиночного
 * `GET /lookup` здесь нет.
 *
 * Источник -- каталог пространства (`ip_countries`, `ip_asns`): то самое,
 * что оператор залил `npm run load-geo` и видит на страницах наборов, и то
 * самое, из чего компилируются наборы инспектора адреса. Панель обязана
 * говорить про адрес ровно то же, что показывает каталог.
 *
 * Кодер (`geo/`) остаётся запасным: он отвечает за тот вид, которого в
 * каталоге пространства нет вовсе. Нет ни каталога, ни кодера -- `503` с
 * кодом, по которому UX отличает «страны нет» от «спросить не у кого».
 */

const MAX_ADDRS = 500;

interface GeoHit {
  countries: { code: string; name?: string }[];
  asns: { asn: number; name?: string }[];
}

function emptyHit(): GeoHit {
  return { countries: [], asns: [] };
}

/**
 * Адрес или сеть. Проверка здесь, а не в SQL: `::inet` на мусоре роняет
 * весь запрос, а испортить пачку одна битая строка не должна -- у неё свой
 * `error`, как у кодера.
 */
function validAddr(value: string): boolean {
  const slash = value.indexOf("/");

  if (slash === -1) {
    return isIP(value) !== 0;
  }

  const head = value.slice(0, slash);
  const bits = Number(value.slice(slash + 1));
  const kind = isIP(head);

  if (kind === 0 || !Number.isInteger(bits) || bits < 0) {
    return false;
  }

  return bits <= (kind === 4 ? 32 : 128);
}

export function geoRouter(
  countries: IpCountryRepo,
  asns: IpAsnRepo,
  geoUrl: string,
): Router {
  const router = Router({ mergeParams: true });
  const base = geoUrl.replace(/\/$/, "");

  router.post("/lookup/batch", async (req, res, next) => {
    const space = scopeOf(req);

    if (space === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    const body = req.body as { addrs?: unknown };
    const addrs = Array.isArray(body?.addrs) ? body.addrs : undefined;

    if (addrs === undefined || addrs.some((a) => typeof a !== "string")) {
      res.status(400).json({ error: "bad_addrs" });
      return;
    }

    if (addrs.length > MAX_ADDRS) {
      res.status(400).json({ error: "too_many_addrs" });
      return;
    }

    const asked = (addrs as string[]).map((addr) => addr.trim());
    const good = [...new Set(asked.filter(validAddr))];

    try {
      const [hasCountries, hasAsns] = await Promise.all([
        countries.filled(space),
        asns.filled(space),
      ]);

      const hits = new Map<string, GeoHit>();
      const hitOf = (addr: string): GeoHit => {
        const kept = hits.get(addr);
        if (kept !== undefined) {
          return kept;
        }
        const fresh = emptyHit();
        hits.set(addr, fresh);
        return fresh;
      };

      if (hasCountries) {
        for (const row of await countries.lookup(space, good)) {
          hitOf(row.addr).countries.push({
            code: row.code,
            ...(row.name === "" ? {} : { name: row.name }),
          });
        }
      }

      if (hasAsns) {
        for (const row of await asns.lookup(space, good)) {
          hitOf(row.addr).asns.push({
            asn: row.asn,
            ...(row.name === "" ? {} : { name: row.name }),
          });
        }
      }

      // Кодера зовём только за тем видом, которого в каталоге нет.
      const fromCoder =
        (!hasCountries || !hasAsns) && base !== ""
          ? await ask(base, good)
          : undefined;

      if (!hasCountries && !hasAsns && fromCoder === undefined) {
        res
          .status(503)
          .json({ error: base === "" ? "geo_disabled" : "geo_unreachable" });
        return;
      }

      if (fromCoder !== undefined) {
        for (const [addr, hit] of fromCoder) {
          const kept = hitOf(addr);
          if (!hasCountries) {
            kept.countries = hit.countries;
          }
          if (!hasAsns) {
            kept.asns = hit.asns;
          }
        }
      }

      res.json({
        results: asked.map((addr) =>
          validAddr(addr)
            ? { addr, ...(hits.get(addr) ?? emptyHit()) }
            : { addr, ...emptyHit(), error: "bad_addr" },
        ),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Спросить кодер. Недоступен или ответил не тем -- `undefined`: каталог
 * уже мог ответить своей половиной, и ронять из-за этого весь ответ незачем.
 */
async function ask(
  base: string,
  addrs: string[],
): Promise<Map<string, GeoHit> | undefined> {
  if (addrs.length === 0) {
    return new Map();
  }

  try {
    const res = await fetch(`${base}/lookup/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addrs }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return undefined;
    }

    const body = (await res.json()) as { results?: unknown };
    const rows = Array.isArray(body.results) ? body.results : [];
    const out = new Map<string, GeoHit>();

    for (const row of rows as {
      addr?: unknown;
      countries?: unknown;
      asns?: unknown;
    }[]) {
      if (typeof row.addr !== "string") {
        continue;
      }

      out.set(row.addr, {
        countries: Array.isArray(row.countries)
          ? (row.countries as GeoHit["countries"])
          : [],
        asns: Array.isArray(row.asns) ? (row.asns as GeoHit["asns"]) : [],
      });
    }

    return out;
  } catch {
    return undefined;
  }
}
