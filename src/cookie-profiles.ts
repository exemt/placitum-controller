import { normalizeDoc } from "./cookie-profile-doc.ts";
import type { Pool } from "./db.ts";
import type { CookieProfile, CookieProfileDoc } from "./model/cookie-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
  created_at: Date;
  updated_at: Date;
}

function ofProfile(row: ProfileRow): CookieProfile {
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

export interface CookieProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
}

export interface CookieProfilePatch {
  name?: string;
  description?: string;
  doc?: CookieProfileDoc;
}

export class CookieProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<CookieProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from cookie_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from cookie_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<CookieProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from cookie_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: CookieProfileInsert): Promise<CookieProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into cookie_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: CookieProfilePatch): Promise<CookieProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update cookie_profiles
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
      `delete from cookie_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  async inspectorNames(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from inspectors where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }
}
