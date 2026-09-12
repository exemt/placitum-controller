/*
 * Профили капчи в Postgres.
 *
 * Профиль лежит документом jsonb: его форма описана в Go и меняется вместе с
 * инспектором, а колонка на поле заставляла бы мигрировать базу на каждое
 * новое поле профиля. Проверка -- captcha-profile-doc.ts, до записи.
 * Секреты внешних провайдеров -- ссылки на store-объекты, контроллер их не
 * открывает.
 */


import { normalizeDoc } from "./captcha-profile-doc.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type {
  CaptchaProfile,
  CaptchaProfileDoc,
} from "./model/captcha-profile.ts";
import { routeInspectsRequests } from "./model/waf-route.ts";


interface ProfileRow {
  id: string;
  http_space_id: string;
  server_id: string | null;
  name: string;
  description: string;
  doc: CaptchaProfileDoc;
  created_at: Date;
  updated_at: Date;
}

/*
 * Документ нормализуется на чтении, а не только на записи: строка, записанная
 * до появления поля, обязана прочитаться с его умолчанием, а не с undefined --
 * иначе новое поле разъезжается по коду проверками на «ключа может не быть».
 */
function ofProfile(row: ProfileRow): CaptchaProfile {
  const doc = normalizeDoc(row.doc ?? {});

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    serverId: row.server_id,
    name: row.name,
    description: row.description,
    when: doc.trigger.when,
    provider: doc.provider.kind,
    fallback: doc.fallback === null ? null : doc.fallback.kind,
    doc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_COLS = `id, http_space_id, server_id, name, description, doc,
                      created_at, updated_at`;

export interface CaptchaProfileInsert {
  httpSpaceId: string;
  serverId: string | null;
  name: string;
  description: string;
  doc: CaptchaProfileDoc;
}

export interface CaptchaProfilePatch {
  serverId?: string | null;
  name?: string;
  description?: string;
  doc?: CaptchaProfileDoc;
}

export class CaptchaProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /* --- профили ------------------------------------------------------------ */

  async list(httpSpaceId?: string): Promise<CaptchaProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from captcha_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from captcha_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<CaptchaProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from captcha_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: CaptchaProfileInsert): Promise<CaptchaProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into captcha_profiles (http_space_id, server_id, name, description, doc)
       values ($1, $2, $3, $4, $5)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.serverId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: CaptchaProfilePatch): Promise<CaptchaProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update captcha_profiles
          set name        = coalesce($2, name),
              description = coalesce($3, description),
              doc         = coalesce($4, doc),
              server_id   = case when $5 then null else coalesce($6, server_id) end,
              updated_at  = now()
        where id = $1
        returning ${PROFILE_COLS}`,
      [
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.doc === undefined ? null : patch.doc,
        patch.serverId === null,
        patch.serverId ?? null,
      ],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from captcha_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  /*
   * Имена инспекторов контура. Нужны правилам prior: правило от отправителя,
   * которого в реестре нет, не сработает никогда, и знать об этом лучше здесь,
   * чем разбором логов. Это замечание, а не отказ -- маршруты разные, и
   * молчание бывает намеренным.
   */
  async inspectorNames(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from inspectors where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }

  /*
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах prior. Список общий на пространство и один на
   * всех получателей: собирает его `sender-codes.ts`, здесь только вход в
   * базу для роутера.
   */
  async senderCodes(httpSpaceId: string): Promise<SenderCode[]> {
    return loadSenderCodes(this.pool, httpSpaceId);
  }

  /*
   * Локейшены сервера. Нужны проверке адреса формы: путь, которого на сервере
   * нет, даёт бесконечный редирект, а путь без `waf off` -- капча, которая
   * требует капчу. И то и другое ловится здесь, а не на стенде.
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
     * inspected -- спрашивают ли на маршруте инспекторов. Рекурсию ("капча
     * требует капчу") создают именно они, а не включённый модуль: локальный
     * слой на странице проверки работает и обязан работать -- иначе адрес,
     * забаненный правилом самой капчи, продолжает молотить по генерации
     * заданий. Поэтому страницей годится и выключенный модуль (как было), и
     * включённый с "waf_inspect request none" -- второе строго защищённее.
     */
    return rows.map((row) => ({
      path: row.path,
      match: row.match,
      wafEnabled: row.enabled !== false,
      inspected: row.enabled !== false && routeInspectsRequests(row.inspectors),
    }));
  }

  /*
   * Тело объекта содержимого пространства -- своя страница капчи. Тип
   * проверяется здесь же: страницей может быть только html.
   */
  async page(
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
}
