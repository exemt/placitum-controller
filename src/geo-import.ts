import type { Pool } from "./db.ts";
import type { DesiredStore } from "./desired.ts";
import {
  fileHash,
  publishGeoDoc,
  putGeoFile,
  type GeoFileInput,
  type GeoFileRepo,
} from "./geo-files.ts";
import { Mmdb, MmdbError } from "./geo-mmdb.ts";
import { targetOf, type GeoKind } from "./geo-sql.ts";
import { log } from "./log.ts";

export const GEO_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;

const BATCH = 10_000;
const PUBLISH_RETRY_MS = 10_000;

export interface CatalogDiff {
  networks: number;
  keys: number;
  added: number;
  removed: number;
}

export class GeoImportError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(status: number, code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "GeoImportError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function importCatalog(
  pool: Pool,
  input: {
    kind: GeoKind;
    spaceId: string;
    db: Mmdb;
    file?: { meta: GeoFileInput; data: Buffer };
  },
  progress: (networks: number) => void = () => {},
): Promise<CatalogDiff> {
  const { kind, spaceId, db, file } = input;
  const t = targetOf(kind);
  const code = kind === "asn" ? "bigint" : "text";
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '30min'");
    await client.query("set local work_mem = '64MB'");
    await client.query(
      `create temp table geo_raw (
         code ${code} not null,
         type text not null,
         address text not null,
         name text not null
       ) on commit drop`,
    );

    const keys = new Set<string>();
    let networks = 0;
    let batch = emptyBatch();

    const flush = async (): Promise<void> => {
      await client.query(
        `insert into geo_raw (code, type, address, name)
         select * from unnest($1::${code}[], $2::text[], $3::text[], $4::text[])`,
        [batch.codes, batch.types, batch.addresses, batch.names],
      );
      networks += batch.codes.length;
      batch = emptyBatch();
      progress(networks);
    };

    for (const net of db.networks()) {
      batch.codes.push(net.code);
      batch.types.push(net.type);
      batch.addresses.push(net.address);
      batch.names.push(net.name);
      keys.add(`${net.code}\0${net.type}`);

      if (batch.codes.length >= BATCH) {
        await flush();
      }
    }

    if (batch.codes.length > 0) {
      await flush();
    }

    if (networks === 0) {
      throw new GeoImportError(400, "mmdb_empty", `${db.meta.databaseType} has no ${kind} networks`);
    }

    await client.query("analyze geo_raw");

    await client.query(
      `insert into ${t.catalog} (http_space_id, ${t.key}, type, description)
       select $1::uuid, g.code, g.type, min(g.name)
         from geo_raw g
        group by g.code, g.type
       on conflict (http_space_id, ${t.key}, type)
       do update set description = excluded.description, updated_at = now()
        where ${t.catalog}.description is distinct from excluded.description`,
      [spaceId],
    );

    const removed = await client.query(
      `delete from ${t.addresses} a
        using ${t.catalog} c
        where a.${t.fk} = c.id
          and c.http_space_id = $1::uuid
          and not exists (
                select 1
                  from geo_raw g
                 where g.code = c.${t.key}
                   and g.type = c.type
                   and g.address = a.address
              )`,
      [spaceId],
    );

    await client.query(
      `delete from ${t.catalog} c
        where c.http_space_id = $1::uuid
          and not exists (
                select 1
                  from geo_raw g
                 where g.code = c.${t.key}
                   and g.type = c.type
              )`,
      [spaceId],
    );

    const added = await client.query(
      `insert into ${t.addresses} (${t.fk}, address)
       select c.id, g.address
         from geo_raw g
         join ${t.catalog} c
           on c.http_space_id = $1::uuid
          and c.${t.key} = g.code
          and c.type = g.type
        where not exists (
                select 1
                  from ${t.addresses} a
                 where a.${t.fk} = c.id
                   and a.address = g.address
              )
       on conflict (${t.fk}, address) do nothing`,
      [spaceId],
    );

    if (file !== undefined) {
      await putGeoFile(client, file.meta, file.data);
    }

    await client.query("commit");

    return {
      networks,
      keys: keys.size,
      added: added.rowCount ?? 0,
      removed: removed.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function emptyBatch(): {
  codes: string[];
  types: string[];
  addresses: string[];
  names: string[];
} {
  return { codes: [], types: [], addresses: [], names: [] };
}

export type GeoImportState = "running" | "done" | "failed";
export type GeoImportPhase = "catalog" | "publish";

export interface GeoImportJob {
  kind: GeoKind;
  spaceId: string;
  state: GeoImportState;
  phase: GeoImportPhase;
  file: GeoFileInput;
  networks: number;
  keys: number;
  added: number;
  removed: number;
  startedAt: Date;
  finishedAt?: Date;
  tookMs?: number;
  error?: string;
  detail?: string;
}

export type ImportCatalog = typeof importCatalog;

export interface GeoImportDeps {
  pool: Pool;
  files: GeoFileRepo;
  desired: DesiredStore;
  countriesChanged(spaceId: string): Promise<void>;
  importCatalog?: ImportCatalog;
}

export class GeoImports {
  private readonly deps: GeoImportDeps;
  private readonly importCatalog: ImportCatalog;
  private readonly jobs = new Map<GeoKind, GeoImportJob>();
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private publishing: Promise<boolean> = Promise.resolve(true);

  constructor(deps: GeoImportDeps) {
    this.deps = deps;
    this.importCatalog = deps.importCatalog ?? importCatalog;
  }

  job(kind: GeoKind): GeoImportJob | undefined {
    return this.jobs.get(kind);
  }

  start(kind: GeoKind, spaceId: string, data: Buffer): GeoImportJob {
    if (this.jobs.get(kind)?.state === "running") {
      throw new GeoImportError(409, "import_running");
    }

    if (data.length === 0) {
      throw new GeoImportError(400, "file_empty");
    }

    let db: Mmdb;

    try {
      db = new Mmdb(data);
    } catch (err) {
      if (err instanceof MmdbError) {
        throw new GeoImportError(400, err.code, err.message);
      }

      throw err;
    }

    if (db.kind !== kind) {
      throw new GeoImportError(400, "mmdb_kind_mismatch", db.kind);
    }

    const job: GeoImportJob = {
      kind,
      spaceId,
      state: "running",
      phase: "catalog",
      file: {
        kind,
        sha256: fileHash(data),
        size: data.length,
        databaseType: db.meta.databaseType,
        buildEpoch: db.meta.buildEpoch,
      },
      networks: 0,
      keys: 0,
      added: 0,
      removed: 0,
      startedAt: new Date(),
    };

    this.jobs.set(kind, job);
    log("info", "geo import started", {
      kind,
      space: spaceId,
      type: job.file.databaseType,
      build: job.file.buildEpoch,
      size: job.file.size,
      sha256: job.file.sha256,
    });

    void this.run(job, db, data);

    return job;
  }

  private async run(job: GeoImportJob, db: Mmdb, data: Buffer): Promise<void> {
    const t0 = performance.now();

    try {
      const diff = await this.importCatalog(
        this.deps.pool,
        { kind: job.kind, spaceId: job.spaceId, db, file: { meta: job.file, data } },
        (networks) => {
          job.networks = networks;
        },
      );

      job.networks = diff.networks;
      job.keys = diff.keys;
      job.added = diff.added;
      job.removed = diff.removed;
      job.phase = "publish";

      if (job.kind === "country") {
        try {
          await this.deps.countriesChanged(job.spaceId);
        } catch (err) {
          log("warn", "geo import: countries reload failed", {
            space: job.spaceId,
            error: messageOf(err),
          });
        }
      }

      await this.publish();
      job.state = "done";
    } catch (err) {
      job.state = "failed";

      if (err instanceof GeoImportError) {
        job.error = err.code;
        job.detail = err.detail;
      } else if (err instanceof MmdbError) {
        job.error = err.code;
        job.detail = err.message;
      } else {
        job.error = "catalog_failed";
        job.detail = messageOf(err);
      }
    } finally {
      job.finishedAt = new Date();
      job.tookMs = Math.round(performance.now() - t0);
    }

    log(job.state === "done" ? "info" : "error", `geo import ${job.state}`, {
      kind: job.kind,
      space: job.spaceId,
      sha256: job.file.sha256,
      networks: job.networks,
      keys: job.keys,
      added: job.added,
      removed: job.removed,
      took_ms: job.tookMs,
      ...(job.error === undefined ? {} : { error: job.error, detail: job.detail }),
    });
  }

  publish(): Promise<boolean> {
    const next = this.publishing.then(
      () => this.publishOnce(),
      () => this.publishOnce(),
    );
    this.publishing = next;
    return next;
  }

  private async publishOnce(): Promise<boolean> {
    this.clearRetry();

    try {
      const out = await publishGeoDoc(this.deps.files, this.deps.desired);

      if (out.published && out.doc !== null) {
        log("info", "geo doc published", {
          rev: out.doc.rev,
          sha256: out.doc.sha256,
          country: out.doc.country?.sha256,
          asn: out.doc.asn?.sha256,
        });
      }

      return true;
    } catch (err) {
      log("warn", "geo doc publish failed", {
        error: messageOf(err),
        retry_ms: PUBLISH_RETRY_MS,
      });

      if (!this.stopped) {
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.publish();
        }, PUBLISH_RETRY_MS);
        this.retry.unref();
      }

      return false;
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
  }

  private clearRetry(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (err !== null && typeof err === "object") {
    return JSON.stringify(err);
  }

  return String(err);
}
