import { normalizeDoc } from "./json-profile-doc.ts";
import type { Pool } from "./db.ts";
import { loadSenderCodes, type SenderCode } from "./sender-codes.ts";
import type { JsonProfile, JsonProfileDoc } from "./model/json-profile.ts";

interface ProfileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: JsonProfileDoc;
  created_at: Date;
  updated_at: Date;
}

function ofProfile(row: ProfileRow): JsonProfile {
  const doc = normalizeDoc(row.doc ?? {});

  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    kind: doc.schema.kind,
    source: doc.schema.source,
    doc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_COLS = `id, http_space_id, name, description, doc,
                      created_at, updated_at`;

export interface JsonProfileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  doc: JsonProfileDoc;
}

export interface JsonProfilePatch {
  name?: string;
  description?: string;
  doc?: JsonProfileDoc;
}

export interface JsonSchemaObject {
  id: string;
  name: string;
  type: string;
  text: string;
}

export class JsonProfileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<JsonProfile[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from json_profiles order by name`,
          )
        : await this.pool.query<ProfileRow>(
            `select ${PROFILE_COLS} from json_profiles
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofProfile);
  }

  async get(id: string): Promise<JsonProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select ${PROFILE_COLS} from json_profiles where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofProfile(rows[0]);
  }

  async insert(input: JsonProfileInsert): Promise<JsonProfile> {
    const { rows } = await this.pool.query<ProfileRow>(
      `insert into json_profiles (http_space_id, name, description, doc)
       values ($1, $2, $3, $4)
       returning ${PROFILE_COLS}`,
      [input.httpSpaceId, input.name, input.description, input.doc],
    );

    return ofProfile(rows[0]);
  }

  async update(id: string, patch: JsonProfilePatch): Promise<JsonProfile | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `update json_profiles
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

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from json_profiles where id = $1`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  }

  async schemaObject(id: string, httpSpaceId: string): Promise<JsonSchemaObject | null> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      type: string;
      body: Buffer | null;
    }>(
      `select d.id, d.name, t.name as type, c.body
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
      id: rows[0].id,
      name: rows[0].name,
      type: rows[0].type,
      text: (rows[0].body ?? Buffer.alloc(0)).toString("utf-8"),
    };
  }

  async denyResponses(httpSpaceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from deny_responses where http_space_id = $1 order by name`,
      [httpSpaceId],
    );

    return rows.map((row) => row.name);
  }
}
