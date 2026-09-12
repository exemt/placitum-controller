/*
 * Профили инспектора действий в Postgres.
 *
 * Профиль лежит документом jsonb: его форма описана в Go и меняется вместе с
 * инспектором, а колонка на поле заставляла бы мигрировать базу на каждое новое
 * поле профиля. Проверка -- action-profile-doc.ts, до записи.
 */

import { normalizeDoc } from "./action-profile-doc.ts";
import type { Pool } from "./db.ts";
import type { ActionProfile, ActionProfileDoc } from "./model/action-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
  created_at: Date;
  updated_at: Date;
}

/*
 * Документ нормализуется на чтении, а не только на записи: строка, записанная
 * до появления поля, обязана прочитаться с его умолчанием, а не с undefined.
 */
function ofProfile(row: ProfileRow): ActionProfile {
  const doc = normalizeDoc(row.doc ?? {});

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    doc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_COLS = `id, http_space_id, name, description, doc,
                      created_at, updated_at`;

export interface ActionProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
}

export interface ActionProfilePatch {
  name?: string;
  description?: string;
  doc?: ActionProfileDoc;
}

export class ActionProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<ActionProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from action_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from action_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<ActionProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from action_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: ActionProfileInsert): Promise<ActionProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into action_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: ActionProfilePatch): Promise<ActionProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update action_profiles
          set name        = coalesce($2, name),
              description = coalesce($3, description),
              doc         = coalesce($4, doc),
              updated_at  = now()
        where id = $1
        returning ${PROFILE_COLS}`,
      [id, patch.name ?? null, patch.description ?? null, patch.doc === undefined ? null : patch.doc],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from action_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  /*
   * Имена инспекторов контура: по ним панель предлагает адресатов, а GET
   * профиля помечает тех, кого в реестре нет. Замечание, а не отказ -- реестр
   * правят отдельно, и профиль, написанный вперёд него, нормальный порядок.
   */
  async inspectorNames(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from inspectors where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }
}
