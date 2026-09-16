import type { Pool } from "./db.ts";
import {
  isStoreType,
  type StoreObject,
  type StoreObjectMeta,
  type StoreType,
} from "./model/store.ts";

interface StoreRow {
  id: string;
  type: string;
  metadata: unknown;
  blob: Buffer;
  created_at: Date;
  size?: string | number;
}

function metaOf(row: StoreRow, size: number): StoreObjectMeta {
  if (!isStoreType(row.type)) {
    throw new Error(`unknown store type "${row.type}"`);
  }

  return {
    id: row.id,
    type: row.type,
    metadata:
      row.metadata !== null && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    size,
    createdAt: row.created_at,
  };
}

export class StoreRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async ping(): Promise<void> {
    await this.pool.query("select 1");
  }

  async list(): Promise<StoreObjectMeta[]> {
    const { rows } = await this.pool.query<StoreRow>(
      `select id, type, metadata, created_at, length(blob) as size
         from store_objects
        order by created_at desc`,
    );

    return rows.map((row) => metaOf(row, Number(row.size)));
  }

  async get(id: string): Promise<StoreObject | null> {
    const { rows } = await this.pool.query<StoreRow>(
      `select id, type, metadata, blob, created_at
         from store_objects
        where id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const meta = metaOf(row, row.blob.length);

    return { ...meta, blob: row.blob };
  }

  async getMeta(id: string): Promise<StoreObjectMeta | null> {
    const { rows } = await this.pool.query<StoreRow>(
      `select id, type, metadata, created_at, length(blob) as size
         from store_objects
        where id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    return metaOf(rows[0], Number(rows[0].size));
  }

  async insert(
    type: StoreType,
    metadata: Record<string, unknown>,
    blob: Buffer,
  ): Promise<StoreObjectMeta> {
    const { rows } = await this.pool.query<StoreRow>(
      `insert into store_objects (type, metadata, blob)
       values ($1, $2::jsonb, $3)
       returning id, type, metadata, created_at, length(blob) as size`,
      [type, JSON.stringify(metadata), blob],
    );

    return metaOf(rows[0], Number(rows[0].size));
  }
}
