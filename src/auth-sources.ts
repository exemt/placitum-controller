/*
 * Источники входа калитки в Postgres.
 *
 * Источник лежит документом jsonb: его форма описана в Go и меняется вместе с
 * инспектором, а колонка на поле заставляла бы мигрировать базу на каждое
 * новое поле. Проверка -- auth-source-doc.ts, до записи.
 *
 * Пароль пользователя не хранится: он приходит в API один раз, тут же
 * хешируется bcrypt и до базы доезжает только хеш. Секрет TOTP не приходит
 * вовсе -- в ряду лежит ссылка на store-объект, зашифрованный в браузере.
 */

import { normalizeSourceDoc } from "./auth-source-doc.ts";
import type { Pool } from "./db.ts";
import type { AuthSource, AuthSourceDoc } from "./model/auth-source.ts";
import { routeInspectsRequests } from "./model/waf-route.ts";

interface SourceRow {
  id: string;
  http_space_id: string;
  server_id: string | null;
  name: string;
  description: string;
  doc: AuthSourceDoc;
  created_at: Date;
  updated_at: Date;
}

/*
 * Документ нормализуется на чтении, а не только на записи: строка, записанная
 * до появления поля, обязана прочитаться с его умолчанием, а не с undefined.
 */
function ofSource(row: SourceRow): AuthSource {
  const doc = normalizeSourceDoc(row.doc ?? {});

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    serverId: row.server_id,
    name: row.name,
    description: row.description,
    provider: doc.provider,
    doc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SOURCE_COLS = `id, http_space_id, server_id, name, description, doc,
                     created_at, updated_at`;

export interface AuthSourceInsert {
  httpSpaceId: string;
  serverId: string | null;
  name: string;
  description: string;
  doc: AuthSourceDoc;
}

export interface AuthSourcePatch {
  serverId?: string | null;
  name?: string;
  description?: string;
  doc?: AuthSourceDoc;
}

export class AuthSourceRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /* --- источники ----------------------------------------------------------- */

  async list(httpSpaceId?: string): Promise<AuthSource[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<SourceRow>(
            `select ${SOURCE_COLS} from auth_sources order by name`,
          )
        : await this.pool.query<SourceRow>(
            `select ${SOURCE_COLS} from auth_sources
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofSource);
  }

  async get(id: string): Promise<AuthSource | null> {
    const { rows } = await this.pool.query<SourceRow>(
      `select ${SOURCE_COLS} from auth_sources where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofSource(rows[0]);
  }

  async insert(input: AuthSourceInsert): Promise<AuthSource> {
    const { rows } = await this.pool.query<SourceRow>(
      `insert into auth_sources (http_space_id, server_id, name, description, doc)
       values ($1, $2, $3, $4, $5)
       returning ${SOURCE_COLS}`,
      [input.httpSpaceId, input.serverId, input.name, input.description, input.doc],
    );

    return ofSource(rows[0]);
  }

  async update(id: string, patch: AuthSourcePatch): Promise<AuthSource | null> {
    const { rows } = await this.pool.query<SourceRow>(
      `update auth_sources
          set name        = coalesce($2, name),
              description = coalesce($3, description),
              doc         = coalesce($4, doc),
              server_id   = case when $5 then null else coalesce($6, server_id) end,
              updated_at  = now()
        where id = $1
        returning ${SOURCE_COLS}`,
      [
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.doc === undefined ? null : patch.doc,
        patch.serverId === null,
        patch.serverId ?? null,
      ],
    );

    return rows.length === 0 ? null : ofSource(rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from auth_sources where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  /*
   * Кто держит источник: профили-калитки (doc.source) и соседние источники
   * (identity.from -- стыкованный TOTP берёт личность из первого источника).
   * Форма строк -- как у общего отчёта занятости (`usage.ts`).
   */
  async uses(
    httpSpaceId: string,
    name: string,
  ): Promise<{ at: string; kind: string }[]> {
    const { rows } = await this.pool.query<{ at: string; kind: string }>(
      `select name as at, 'auth' as kind
         from auth_profiles
        where http_space_id = $1 and doc ->> 'source' = $2
       union all
       select name, 'auth_source'
         from auth_sources
        where http_space_id = $1
          and name <> $2
          and doc #>> '{identity,from}' = $2
       order by at`,
      [httpSpaceId, name],
    );

    return rows;
  }

  /*
   * Локейшены сервера. Нужны проверке адреса формы: путь, которого на сервере
   * нет, даёт бесконечный редирект, а путь без `waf off` -- вход, который
   * требует входа. И то и другое ловится здесь, а не на стенде.
   */
  async serverLocations(
    serverId: string,
    httpSpaceId: string,
  ): Promise<
    { path: string; match: string; wafEnabled: boolean; inspected: boolean }[] | null
  > {
    const { rows: servers } = await this.pool.query<{ id: string }>(
      `select id from servers where id = $1 and http_space_id = $2`,
      [serverId, httpSpaceId],
    );

    if (servers.length === 0) {
      return null;
    }

    const { rows } = await this.pool.query<{
      path: string;
      match: string;
      enabled: boolean | null;
      inspectors: unknown;
    }>(
      `select path, match, (waf ->> 'enabled')::boolean as enabled,
              waf -> 'requestInspectors' as inspectors
         from locations
        where server_id = $1 and enabled
        order by position, path`,
      [serverId],
    );

    /*
     * Умолчание waf на маршруте -- наследование от сервера, то есть "включён".
     * Отсутствие ключа читается как true: калитка на своей же форме -- ошибка,
     * которую лучше показать лишний раз, чем пропустить.
     *
     * inspected -- спрашивают ли на маршруте инспекторов. Именно они создают
     * рекурсию ("вход требует входа"), а локальный слой на форме нужен:
     * без него отменённая снаружи сессия продолжает ходить на форму, а
     * перебор упирается только во внутренние лимиты сервиса. Поэтому формой
     * годится и выключенный модуль (как было), и включённый с
     * "waf_inspect request none" -- второе строго защищённее.
     */
    return rows.map((row) => ({
      path: row.path,
      match: row.match,
      wafEnabled: row.enabled !== false,
      inspected: row.enabled !== false && routeInspectsRequests(row.inspectors),
    }));
  }

  /*
   * Тело объекта содержимого пространства -- своя форма входа источника. Тип
   * проверяется здесь же: формой может быть только html, а не json или шрифт.
   */
  async loginPage(
    id: string,
    httpSpaceId: string,
  ): Promise<{ name: string; type: string; text: string } | null> {
    const { rows } = await this.pool.query<{
      name: string;
      type: string;
      body: Buffer | null;
    }>(
      `select d.name, t.name as type, c.body
         from datasets d
         join content_types t on t.id = d.content_type_id
         left join dataset_contents c on c.dataset_id = d.id
        where d.id = $1 and d.http_space_id = $2 and d.kind = 'content'`,
      [id, httpSpaceId],
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      name: rows[0].name,
      type: rows[0].type,
      text: (rows[0].body ?? Buffer.alloc(0)).toString("utf-8"),
    };
  }

  /* --- наборы пользователей ------------------------------------------------ */

  async usersByName(
    httpSpaceId: string,
    name: string,
  ): Promise<string[] | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from datasets
        where http_space_id = $1 and name = $2 and kind = 'list' and type = 'string'`,
      [httpSpaceId, name],
    );

    if (rows.length === 0) {
      return null;
    }

    const { rows: entries } = await this.pool.query<{ address: string }>(
      `select address from dataset_addresses where dataset_id = $1 order by address`,
      [rows[0].id],
    );

    return entries.map((row) => row.address);
  }
}
