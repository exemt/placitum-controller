import { referencedDataFiles } from "./compile/pack.ts";
import type { Pool } from "./db.ts";
import type { RuleFile, RuleFileMeta } from "./model/rule-set.ts";

interface FileRow {
  id: string;
  http_space_id: string;
  name: string;
  description: string;
  text_raw?: string;
  created_at: Date;
  updated_at: Date;
}

function ofMeta(row: FileRow): RuleFileMeta {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ofFile(row: FileRow): RuleFile {
  return {
    ...ofMeta(row),
    textRaw: row.text_raw ?? "",
  };
}

const META_COLS = `id, http_space_id, name, description, created_at, updated_at`;

export interface RuleFileInsert {
  httpSpaceId: string;
  name: string;
  description: string;
  textRaw: string;
}

export interface RuleFilePatch {
  name?: string;
  description?: string;
  textRaw?: string;
}

export class RuleFileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async listWithText(httpSpaceId: string): Promise<RuleFile[]> {
    const { rows } = await this.pool.query<FileRow>(
      `select ${META_COLS}, text_raw from rule_files
        where http_space_id = $1
        order by name`,
      [httpSpaceId],
    );

    return rows.map(ofFile);
  }

  async list(httpSpaceId?: string): Promise<RuleFileMeta[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<FileRow>(
            `select ${META_COLS} from rule_files order by name`,
          )
        : await this.pool.query<FileRow>(
            `select ${META_COLS} from rule_files
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofMeta);
  }

  async get(id: string): Promise<RuleFile | null> {
    const { rows } = await this.pool.query<FileRow>(
      `select ${META_COLS}, text_raw from rule_files where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofFile(rows[0]);
  }

  async insert(input: RuleFileInsert): Promise<RuleFile> {
    const { rows } = await this.pool.query<FileRow>(
      `insert into rule_files (http_space_id, name, description, text_raw)
       values ($1, $2, $3, $4)
       returning ${META_COLS}, text_raw`,
      [input.httpSpaceId, input.name, input.description, input.textRaw],
    );

    return ofFile(rows[0]);
  }

  async update(id: string, patch: RuleFilePatch): Promise<RuleFile | null> {
    const { rows } = await this.pool.query<FileRow>(
      `update rule_files set
         name        = coalesce($2, name),
         description = coalesce($3, description),
         text_raw    = coalesce($4, text_raw),
         updated_at  = now()
       where id = $1
       returning ${META_COLS}, text_raw`,
      [id, patch.name ?? null, patch.description ?? null, patch.textRaw ?? null],
    );

    return rows.length === 0 ? null : ofFile(rows[0]);
  }

  async setUses(
    id: string,
    name: string,
    httpSpaceId: string,
  ): Promise<{ at: string; kind: string }[]> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select distinct s.name
         from rule_set_files m
         join rule_sets s on s.id = m.rule_set_id
        where m.rule_file_id = $1
        order by s.name`,
      [id],
    );

    const out = rows.map((row) => ({ at: row.name, kind: "included" }));

    const { rows: texts } = await this.pool.query<{
      name: string;
      text_raw: string;
    }>(
      `select name, text_raw from rule_files
        where http_space_id = $1 and id <> $2
          and text_raw like '%@pmFromFile%'
        order by name`,
      [httpSpaceId, id],
    );

    for (const row of texts) {
      if (referencedDataFiles(row.text_raw).includes(name)) {
        out.push({ at: row.name, kind: "pmFromFile" });
      }
    }

    return out;
  }

  async delete(id: string): Promise<RuleFile | null> {
    const current = await this.get(id);

    if (current === null) {
      return null;
    }

    await this.pool.query(`delete from rule_files where id = $1`, [id]);

    return current;
  }

  async idsInSpace(httpSpaceId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }

    const { rows } = await this.pool.query<{ id: string }>(
      `select id from rule_files
        where http_space_id = $1 and id = any($2::uuid[])`,
      [httpSpaceId, ids],
    );

    return rows.map((row) => row.id);
  }
}
