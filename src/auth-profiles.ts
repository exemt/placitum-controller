/*
 * Профили калитки в Postgres.
 *
 * Профиль лежит документом jsonb: его форма описана в Go и меняется вместе с
 * инспектором. Проверка -- auth-profile-doc.ts, до записи. Всё про сам вход
 * (провайдер, форма, сессии, пользователи) живёт в источнике -- auth-sources.ts.
 */

import { normalizeDoc } from "./auth-profile-doc.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type { AuthProfile, AuthProfileDoc } from "./model/auth-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: AuthProfileDoc;
  created_at: Date;
  updated_at: Date;
}

/*
 * Документ нормализуется на чтении, а не только на записи: строка, записанная
 * до появления поля, обязана прочитаться с его умолчанием, а не с undefined --
 * иначе новое поле разъезжается по коду проверками на «ключа может не быть».
 */
function ofProfile(row: ProfileRow): AuthProfile {
  const doc = normalizeDoc(row.doc ?? {});

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    source: doc.source,
    doc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_COLS = `id, http_space_id, name, description, doc,
                      created_at, updated_at`;

export interface AuthProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: AuthProfileDoc;
}

export interface AuthProfilePatch {
  name?: string;
  description?: string;
  doc?: AuthProfileDoc;
}

export class AuthProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /* --- профили ------------------------------------------------------------ */

  async list(httpSpaceId?: string): Promise<AuthProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from auth_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from auth_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<AuthProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from auth_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: AuthProfileInsert): Promise<AuthProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into auth_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: AuthProfilePatch): Promise<AuthProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update auth_profiles
          set name        = coalesce($2, name),
              description = coalesce($3, description),
              doc         = coalesce($4, doc),
              updated_at  = now()
        where id = $1
        returning ${PROFILE_COLS}`,
      [
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.doc === undefined ? null : patch.doc,
      ],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from auth_profiles where id = $1`,
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

  /** Имена записей каталога отказов пространства: их называет профиль. */
  async denyResponses(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from deny_responses where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }
}
