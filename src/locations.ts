import type { Pool } from "./db.ts";
import {
  isLocationHandler,
  isLocationProtocol,
  isLocationMatch,
  type Location,
  type LocationHandler,
  type LocationMatch,
  type LocationProtocol,
} from "./model/location.ts";
import type { NginxLocationSettings } from "./model/settings.ts";
import type { WafRouteSettings } from "./model/waf-route.ts";

interface LocationRow {
  id: string;
  server_id: string;
  match: string;
  path: string;
  position: number;
  enabled: boolean;
  handler: string;
  protocol: string;
  upstream_id: string | null;
  upstream_uri: string | null;
  return_status: number | null;
  return_page: string | null;
  return_url: string | null;
  nginx: NginxLocationSettings;
  waf: WafRouteSettings;
  raw: boolean;
  raw_nginx: string;
  builtin: boolean;
  http_space_id?: string;
  server_name?: string;
}

export interface LocationView extends Location {
  httpSpaceId: string;
  serverName: string;
}

function ofLocation(row: LocationRow): Location {
  if (!isLocationMatch(row.match)) {
    throw new Error(`unknown location match "${row.match}"`);
  }
  if (!isLocationHandler(row.handler)) {
    throw new Error(`unknown location handler "${row.handler}"`);
  }

  const loc: Location = {
    id: row.id,
    serverId: row.server_id,
    match: row.match,
    path: row.path,
    position: row.position,
    enabled: row.enabled,
    handler: row.handler,
    // Строка до миграции 079 либо мусор мимо ручки: считаем обычным путём.
    protocol: isLocationProtocol(row.protocol) ? row.protocol : "http",
    nginx: row.nginx ?? {},
    waf: row.waf ?? {},
    raw: row.raw,
    rawNginx: row.raw_nginx ?? "",
    builtin: row.builtin === true,
  };

  if (row.upstream_id !== null) {
    loc.upstreamId = row.upstream_id;
  }
  if (row.upstream_uri !== null) {
    loc.upstreamUri = row.upstream_uri;
  }
  if (row.return_status !== null) {
    loc.returnStatus = row.return_status;
  }
  if (row.return_page !== null) {
    loc.returnPage = row.return_page;
  }
  if (row.return_url !== null) {
    loc.returnUrl = row.return_url;
  }

  return loc;
}

function ofView(row: LocationRow): LocationView {
  return {
    ...ofLocation(row),
    httpSpaceId: row.http_space_id ?? "",
    serverName: row.server_name ?? "",
  };
}

const COLS = `l.id, l.server_id, l.match, l.path, l.position, l.enabled, l.handler, l.protocol,
              l.upstream_id, l.upstream_uri, l.return_status, l.return_page, l.return_url,
              l.nginx, l.waf, l.raw, l.raw_nginx, l.builtin,
              s.http_space_id, s.name as server_name`;

const FROM = `locations l join servers s on s.id = l.server_id`;

export interface LocationInsert {
  serverId: string;
  match: LocationMatch;
  path: string;
  /** Без позиции путь встаёт в конец списка своего сервера. */
  position?: number;
  enabled: boolean;
  handler: LocationHandler;
  protocol?: LocationProtocol;
  upstreamId?: string;
  upstreamUri?: string;
  returnStatus?: number;
  returnPage?: string;
  returnUrl?: string;
  nginx: NginxLocationSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
}

export interface LocationPatch {
  match?: LocationMatch;
  path?: string;
  position?: number;
  enabled?: boolean;
  handler?: LocationHandler;
  protocol?: LocationProtocol;
  upstreamId?: string | null;
  upstreamUri?: string | null;
  returnStatus?: number | null;
  returnPage?: string | null;
  returnUrl?: string | null;
  nginx?: NginxLocationSettings;
  waf?: WafRouteSettings;
  raw?: boolean;
  rawNginx?: string;
}

export class LocationRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string, serverId?: string): Promise<LocationView[]> {
    if (serverId !== undefined) {
      const { rows } = await this.pool.query<LocationRow>(
        `select ${COLS} from ${FROM}
          where l.server_id = $1
          order by l.position, l.path`,
        [serverId],
      );
      return rows.map(ofView);
    }

    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<LocationRow>(
            `select ${COLS} from ${FROM}
              order by s.name, l.position, l.path`,
          )
        : await this.pool.query<LocationRow>(
            `select ${COLS} from ${FROM}
              where s.http_space_id = $1
              order by s.name, l.position, l.path`,
            [httpSpaceId],
          );

    return rows.map(ofView);
  }

  async get(id: string): Promise<LocationView | null> {
    const { rows } = await this.pool.query<LocationRow>(
      `select ${COLS} from ${FROM} where l.id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofView(rows[0]);
  }

  async insert(input: LocationInsert): Promise<LocationView> {
    const { rows } = await this.pool.query<LocationRow>(
      `insert into locations
         (server_id, match, path, position, enabled, handler,
          upstream_id, upstream_uri, return_status, return_page, return_url,
          nginx, waf, raw, raw_nginx, protocol)
       values ($1, $2, $3,
               coalesce($4, (select coalesce(max(position), -1) + 1
                               from locations where server_id = $1)),
               $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning id, server_id, match, path, position, enabled, handler, protocol,
                 upstream_id, upstream_uri, return_status, return_page, return_url,
                 nginx, waf, raw, raw_nginx, builtin`,
      [
        input.serverId,
        input.match,
        input.path,
        input.position ?? null,
        input.enabled,
        input.handler,
        input.upstreamId ?? null,
        input.upstreamUri ?? null,
        input.returnStatus ?? null,
        input.returnPage ?? null,
        input.returnUrl ?? null,
        input.nginx,
        input.waf,
        input.raw,
        input.rawNginx,
        input.protocol ?? "http",
      ],
    );

    const row = await this.get(rows[0].id);
    if (row === null) {
      throw new Error("location insert vanished");
    }
    return row;
  }

  async update(id: string, patch: LocationPatch): Promise<LocationView | null> {
    const current = await this.get(id);
    if (current === null) {
      return null;
    }

    const { rows } = await this.pool.query<LocationRow>(
      `update locations set
         match         = coalesce($2, match),
         path          = coalesce($3, path),
         position      = coalesce($4, position),
         enabled       = coalesce($5, enabled),
         handler       = coalesce($6, handler),
         upstream_id   = case when $7 then $8::uuid else upstream_id end,
         upstream_uri  = case when $9 then $10 else upstream_uri end,
         return_status = case when $11 then $12::integer else return_status end,
         return_page   = case when $13 then $14 else return_page end,
         return_url    = case when $15 then $16 else return_url end,
         nginx         = coalesce($17, nginx),
         waf           = coalesce($18, waf),
         raw           = coalesce($19, raw),
         raw_nginx     = coalesce($20, raw_nginx),
         protocol      = coalesce($21, protocol)
       where id = $1
       returning id`,
      [
        id,
        patch.match ?? null,
        patch.path ?? null,
        patch.position ?? null,
        patch.enabled ?? null,
        patch.handler ?? null,
        patch.upstreamId !== undefined,
        patch.upstreamId ?? null,
        patch.upstreamUri !== undefined,
        patch.upstreamUri ?? null,
        patch.returnStatus !== undefined,
        patch.returnStatus ?? null,
        patch.returnPage !== undefined,
        patch.returnPage ?? null,
        patch.returnUrl !== undefined,
        patch.returnUrl ?? null,
        patch.nginx ?? null,
        patch.waf ?? null,
        patch.raw ?? null,
        patch.rawNginx ?? null,
        patch.protocol ?? null,
      ],
    );

    return rows.length === 0 ? null : this.get(id);
  }

  /**
   * Порядок путей сервера целиком: `ids` -- все его пути в новой
   * последовательности, позиция становится индексом. Список обязан совпадать
   * с содержимым сервера один в один: иначе панель правит порядок по
   * устаревшему снимку, и перезаписывать им чужие добавления нельзя.
   */
  async reorder(serverId: string, ids: string[]): Promise<LocationView[] | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ id: string }>(
        `select id from locations where server_id = $1 for update`,
        [serverId],
      );
      const have = new Set(rows.map((row) => row.id));
      if (have.size !== ids.length || ids.some((id) => !have.has(id))) {
        await client.query("rollback");
        return null;
      }
      await client.query(
        `update locations l set position = o.position
           from unnest($1::uuid[], $2::integer[]) as o(id, position)
          where l.id = o.id`,
        [ids, ids.map((_, index) => index)],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return this.list(undefined, serverId);
  }

  async delete(id: string): Promise<LocationView | null> {
    const current = await this.get(id);
    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from locations where id = $1`, [id]);
    return current;
  }
}
