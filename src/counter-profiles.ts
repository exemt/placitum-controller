import { normalizeDoc, normalizeShared } from "./counter-profile-doc.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type {
  CounterProfile,
  CounterProfileDoc,
  CounterSharedDoc,
} from "./model/counter-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
  created_at: Date;
  updated_at: Date;
}

function ofProfile(row: ProfileRow): CounterProfile {
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

export interface CounterProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
}

export interface CounterProfilePatch {
  name?: string;
  description?: string;
  doc?: CounterProfileDoc;
}

export class CounterProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<CounterProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from counter_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from counter_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<CounterProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from counter_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: CounterProfileInsert): Promise<CounterProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into counter_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(
    id: string,
    patch: CounterProfilePatch,
  ): Promise<CounterProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update counter_profiles
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
      `delete from counter_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  async shared(httpSpaceId: string): Promise<CounterSharedDoc> {
    const { rows } = await this.pool.query<{ doc: unknown }>(
      `select doc from counter_shared where http_space_id = $1`,
      [httpSpaceId],
    );

    return normalizeShared(rows.length === 0 ? {} : rows[0].doc);
  }

  async putShared(httpSpaceId: string, doc: CounterSharedDoc): Promise<void> {
    await this.pool.query(
      `insert into counter_shared (http_space_id, doc)
       values ($1, $2)
       on conflict (http_space_id)
       do update set doc = excluded.doc, updated_at = now()`,
      [httpSpaceId, doc],
    );
  }

  async inspectorNames(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from inspectors where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }

  async senderCodes(httpSpaceId: string): Promise<SenderCode[]> {
    return loadSenderCodes(this.pool, httpSpaceId);
  }

  async denyResponses(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from deny_responses where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }
}
