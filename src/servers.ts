import type { Pool } from "./db.ts";
import type { Server } from "./model/server.ts";
import type { NginxServerSettings } from "./model/settings.ts";
import type { WafRouteSettings } from "./model/waf-route.ts";

interface ServerRow {
  id: string;
  http_space_id: string;
  name: string;
  server_names: string[];
  enabled: boolean;
  nginx: NginxServerSettings;
  waf: WafRouteSettings;
  raw: boolean;
  raw_nginx: string;
}

function ofServer(row: ServerRow): Server {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    serverNames: row.server_names ?? [],
    enabled: row.enabled,
    nginx: row.nginx ?? {},
    waf: row.waf ?? {},
    raw: row.raw,
    rawNginx: row.raw_nginx ?? "",
  };
}

const COLS = `id, http_space_id, name, server_names, enabled, nginx, waf, raw, raw_nginx`;

export interface ServerInsert {
  httpSpaceId: string;
  name: string;
  serverNames: string[];
  enabled: boolean;
  nginx: NginxServerSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
}

export interface ServerPatch {
  name?: string;
  serverNames?: string[];
  enabled?: boolean;
  nginx?: NginxServerSettings;
  waf?: WafRouteSettings;
  raw?: boolean;
  rawNginx?: string;
}

export class ServerRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<Server[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ServerRow>(
            `select ${COLS} from servers order by name`,
          )
        : await this.pool.query<ServerRow>(
            `select ${COLS} from servers
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofServer);
  }

  async get(id: string): Promise<Server | null> {
    const { rows } = await this.pool.query<ServerRow>(
      `select ${COLS} from servers where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofServer(rows[0]);
  }

  async insert(input: ServerInsert): Promise<Server> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<ServerRow>(
        `insert into servers
           (http_space_id, name, server_names, enabled, nginx, waf, raw, raw_nginx)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning ${COLS}`,
        [
          input.httpSpaceId,
          input.name,
          input.serverNames,
          input.enabled,
          input.nginx,
          input.waf,
          input.raw,
          input.rawNginx,
        ],
      );
      await client.query(
        `insert into locations
           (server_id, match, path, position, enabled, handler, return_status,
            nginx, waf, raw, raw_nginx, builtin)
         values ($1, 'prefix', '/', 0, true, 'return', 404,
                 '{}'::jsonb, '{}'::jsonb, false, '', true)`,
        [rows[0].id],
      );
      await client.query("commit");
      return ofServer(rows[0]);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async update(id: string, patch: ServerPatch): Promise<Server | null> {
    const { rows } = await this.pool.query<ServerRow>(
      `update servers set
         name         = coalesce($2, name),
         server_names = coalesce($3, server_names),
         enabled      = coalesce($4, enabled),
         nginx        = coalesce($5, nginx),
         waf          = coalesce($6, waf),
         raw          = coalesce($7, raw),
         raw_nginx    = coalesce($8, raw_nginx)
       where id = $1
       returning ${COLS}`,
      [
        id,
        patch.name ?? null,
        patch.serverNames ?? null,
        patch.enabled ?? null,
        patch.nginx ?? null,
        patch.waf ?? null,
        patch.raw ?? null,
        patch.rawNginx ?? null,
      ],
    );

    return rows.length === 0 ? null : ofServer(rows[0]);
  }

  async delete(id: string): Promise<Server | null> {
    const { rows } = await this.pool.query<ServerRow>(
      `delete from servers where id = $1 returning ${COLS}`,
      [id],
    );

    return rows.length === 0 ? null : ofServer(rows[0]);
  }
}
