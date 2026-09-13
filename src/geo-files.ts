/*
 * Выгрузки MaxMind, которые контроллер раздаёт кодеру: файл целиком на вид.
 *
 * Каталог пространства (ip_countries, ip_asns) -- разобранные строки: их
 * читают панель, словари ClickHouse и паки инспектора адреса. Кодеру (geo/)
 * нужен сам файл: таблицы он строит своим читателем и держит в памяти. Файл
 * один на контур, как и кодер, -- последняя загрузка вида.
 *
 * О файле кодер узнаёт документом policy/geo в KV WAF_DESIRED
 *
 *     {"v":1,"kind":"geo","rev":3,"sha256":"sha256:…",
 *      "country":{"sha256":"sha256:…","size":8673233,"type":"GeoLite2-Country","build":1723644981},
 *      "asn":{…}}
 *
 * и забирает копию GET /api/geo/files/<вид>. Документ, а не subject с
 * командой: KV помнит значение, и кодер, поднявшийся после загрузки, получает
 * его первым же событием watch, а не ждёт следующей загрузки.
 */

import { createHash } from "node:crypto";

import type pg from "pg";

import type { Pool } from "./db.ts";
import type { DesiredStore } from "./desired.ts";
import type { GeoKind } from "./geo-sql.ts";

export const GEO_KINDS: readonly GeoKind[] = ["country", "asn"];
export const GEO_KEY = "policy/geo";
export const GEO_DOC_KIND = "geo";

export function isGeoKind(value: unknown): value is GeoKind {
  return value === "country" || value === "asn";
}

export interface GeoFileMeta {
  kind: GeoKind;
  /** `sha256:<hex>` -- та же форма, что у указателей поколений. */
  sha256: string;
  size: number;
  databaseType: string;
  buildEpoch: number;
  uploadedAt: Date;
}

export type GeoFileInput = Omit<GeoFileMeta, "uploadedAt">;

export interface GeoDocFile {
  sha256: string;
  size: number;
  type: string;
  build: number;
}

export interface GeoDoc {
  v: 1;
  kind: typeof GEO_DOC_KIND;
  rev: number;
  /** Хеш пары файлов: по нему кадр присутствия кодера сходится с документом. */
  sha256: string;
  country?: GeoDocFile;
  asn?: GeoDocFile;
}

interface FileRow {
  kind: string;
  sha256: string;
  size: string | number;
  database_type: string;
  build_epoch: string | number;
  uploaded_at: Date;
}

const META_COLS = "kind, sha256, size, database_type, build_epoch, uploaded_at";

function ofRow(row: FileRow): GeoFileMeta {
  if (!isGeoKind(row.kind)) {
    throw new Error(`unknown geo file kind "${row.kind}"`);
  }

  return {
    kind: row.kind,
    sha256: row.sha256,
    size: Number(row.size),
    databaseType: row.database_type,
    buildEpoch: Number(row.build_epoch),
    uploadedAt: row.uploaded_at,
  };
}

export class GeoFileRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /** Что загружено, без самих файлов. */
  async list(): Promise<GeoFileMeta[]> {
    const { rows } = await this.pool.query<FileRow>(
      `select ${META_COLS} from geo_files order by kind`,
    );

    return rows.map(ofRow);
  }

  async data(kind: GeoKind): Promise<{ meta: GeoFileMeta; data: Buffer } | null> {
    const { rows } = await this.pool.query<FileRow & { data: Buffer }>(
      `select ${META_COLS}, data from geo_files where kind = $1`,
      [kind],
    );

    return rows.length === 0 ? null : { meta: ofRow(rows[0]), data: rows[0].data };
  }
}

/**
 * Положить файл. Зовётся той же транзакцией, что сверка каталога
 * (geo-import.ts): кодер не должен получить файл, которого каталог не видел.
 */
export async function putGeoFile(
  client: pg.PoolClient,
  file: GeoFileInput,
  data: Buffer,
): Promise<void> {
  await client.query(
    `insert into geo_files (kind, sha256, size, database_type, build_epoch, data)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (kind) do update
        set sha256 = excluded.sha256,
            size = excluded.size,
            database_type = excluded.database_type,
            build_epoch = excluded.build_epoch,
            data = excluded.data,
            uploaded_at = now()`,
    [file.kind, file.sha256, file.size, file.databaseType, file.buildEpoch, data],
  );
}

export function fileHash(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function buildGeoDoc(files: GeoFileMeta[], rev: number): GeoDoc {
  const doc: GeoDoc = { v: 1, kind: GEO_DOC_KIND, rev, sha256: "" };

  for (const file of files) {
    doc[file.kind] = {
      sha256: file.sha256,
      size: file.size,
      type: file.databaseType,
      build: file.buildEpoch,
    };
  }

  const pair = GEO_KINDS.map((kind) => `${kind} ${doc[kind]?.sha256 ?? "-"}`).join("\n");
  doc.sha256 = fileHash(Buffer.from(pair, "utf8"));

  return doc;
}

export function parseGeoDoc(input: unknown): GeoDoc | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const row = input as Record<string, unknown>;

  if (
    row.v !== 1 ||
    row.kind !== GEO_DOC_KIND ||
    typeof row.rev !== "number" ||
    !Number.isInteger(row.rev) ||
    row.rev < 1 ||
    typeof row.sha256 !== "string"
  ) {
    return null;
  }

  const doc: GeoDoc = { v: 1, kind: GEO_DOC_KIND, rev: row.rev, sha256: row.sha256 };

  for (const kind of GEO_KINDS) {
    if (row[kind] === undefined) {
      continue;
    }

    const file = parseDocFile(row[kind]);

    if (file === null) {
      return null;
    }

    doc[kind] = file;
  }

  return doc;
}

function parseDocFile(input: unknown): GeoDocFile | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const row = input as Record<string, unknown>;

  if (
    typeof row.sha256 !== "string" ||
    typeof row.size !== "number" ||
    typeof row.type !== "string" ||
    typeof row.build !== "number"
  ) {
    return null;
  }

  return { sha256: row.sha256, size: row.size, type: row.type, build: row.build };
}

/**
 * Привести документ к файлам в базе. Ревизия растёт только тогда, когда
 * файлы другие: повторная загрузка того же файла кодер не дёргает.
 */
export async function publishGeoDoc(
  files: GeoFileRepo,
  desired: DesiredStore,
): Promise<{ doc: GeoDoc | null; published: boolean }> {
  const rows = await files.list();

  // Ничего не загружали: кодер живёт на своём каталоге, и KV трогать незачем.
  if (rows.length === 0) {
    return { doc: null, published: false };
  }

  const current = await desired.getGeo();
  const next = buildGeoDoc(rows, (current?.rev ?? 0) + 1);

  if (current !== null && current.sha256 === next.sha256) {
    return { doc: current, published: false };
  }

  await desired.putGeo(next);

  return { doc: next, published: true };
}
