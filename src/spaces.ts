import type { Pool } from "./db.ts";
import type { HttpSpace } from "./model/http-space.ts";
import type {
  NginxHttpSettings,
  NginxMainSettings,
  WafHttpSettings,
} from "./model/settings.ts";
import type { WafRouteSettings } from "./model/waf-route.ts";

interface SpaceRow {
  id: string;
  name: string;
  nginx_main: NginxMainSettings;
  nginx: NginxHttpSettings;
  waf_http: WafHttpSettings;
  waf: WafRouteSettings;
  raw: boolean;
  raw_nginx: string;
  created_at: Date;
  updated_at: Date;
}

function ofSpace(row: SpaceRow): HttpSpace {
  return {
    id: row.id,
    name: row.name,
    nginxMain: row.nginx_main ?? {},
    nginx: row.nginx ?? {},
    wafHttp: row.waf_http ?? {},
    waf: row.waf ?? {},
    raw: row.raw,
    rawNginx: row.raw_nginx ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SpaceRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<HttpSpace[]> {
    const { rows } = await this.pool.query<SpaceRow>(
      `select id, name, nginx_main, nginx, waf_http, waf, raw, raw_nginx,
              created_at, updated_at
         from http_spaces
        order by name`,
    );

    return rows.map(ofSpace);
  }

  async exists(id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from http_spaces where id = $1`,
      [id],
    );

    return rows.length > 0;
  }

  async get(id: string): Promise<HttpSpace | null> {
    const { rows } = await this.pool.query<SpaceRow>(
      `select id, name, nginx_main, nginx, waf_http, waf, raw, raw_nginx,
              created_at, updated_at
         from http_spaces
        where id = $1`,
      [id],
    );

    return rows[0] === undefined ? null : ofSpace(rows[0]);
  }

  async update(id: string, patch: SpaceHttpPatch): Promise<HttpSpace | null> {
    const { rows } = await this.pool.query<SpaceRow>(
      `update http_spaces
          set nginx_main = coalesce($2, nginx_main),
              nginx = $3,
              waf_http = $4,
              waf = $5,
              raw = $6,
              raw_nginx = $7,
              updated_at = now()
        where id = $1
    returning id, name, nginx_main, nginx, waf_http, waf, raw, raw_nginx,
              created_at, updated_at`,
      [
        id,
        patch.nginxMain ?? null,
        patch.nginx,
        patch.wafHttp,
        patch.waf,
        patch.raw,
        patch.rawNginx,
      ],
    );

    return rows[0] === undefined ? null : ofSpace(rows[0]);
  }
}

export interface SpaceHttpPatch {
  /** Ключа нет в запросе -- главный контекст остаётся прежним, а не обнуляется. */
  nginxMain?: NginxMainSettings;
  nginx: NginxHttpSettings;
  wafHttp: WafHttpSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
}
