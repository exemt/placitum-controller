import { normalizeDoc } from "./vlai-profile-doc.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type { VlaiProfile, VlaiProfileDoc } from "./model/vlai-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: VlaiProfileDoc;
  created_at: Date;
  updated_at: Date;
}

function ofProfile(row: ProfileRow): VlaiProfile {
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

export interface VlaiProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: VlaiProfileDoc;
}

export interface VlaiProfilePatch {
  name?: string;
  description?: string;
  doc?: VlaiProfileDoc;
}

export class VlaiProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<VlaiProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from vlai_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from vlai_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<VlaiProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from vlai_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: VlaiProfileInsert): Promise<VlaiProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into vlai_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: VlaiProfilePatch): Promise<VlaiProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update vlai_profiles
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
      `delete from vlai_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  async inspectorNames(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from inspectors where http_space_id = $1 and installed order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }

  async senderCodes(httpSpaceId: string): Promise<SenderCode[]> {
    return loadSenderCodes(this.pool, httpSpaceId);
  }
}
