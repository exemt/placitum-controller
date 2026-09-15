// Applies schema/01-schema.sql and 02-seed.sql to an empty database in one transaction;
// a database that already has a schema is left alone.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type pg from "pg";

import { createPool } from "./db.ts";
import { load } from "./config.ts";
import { log, setLevel } from "./log.ts";

export type MigrateOptions = {
  schemaDir: string;
  check?: boolean;
};

export type MigrateReport = {
  empty: boolean;
  initialized: boolean;
};

const LOCK_KEY = 7413001;

const FILES = ["01-schema.sql", "02-seed.sql"];

const SENTINEL = "public.http_spaces";

export async function migrate(pool: pg.Pool, opts: MigrateOptions): Promise<MigrateReport> {
  for (const name of FILES) {
    if (!existsSync(join(opts.schemaDir, name))) {
      throw new Error(`файл схемы не найден: ${join(opts.schemaDir, name)} (CONTROLLER_SCHEMA_DIR)`);
    }
  }

  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    const { rows } = await client.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [SENTINEL]);
    const empty = rows[0]?.ok !== true;

    if (!empty || opts.check) {
      return { empty, initialized: false };
    }

    await client.query("begin");

    try {
      for (const name of FILES) {
        try {
          await client.query(readFileSync(join(opts.schemaDir, name), "utf8"));
        } catch (err) {
          throw new Error(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      await client.query("set search_path to public").catch(() => {});
    }

    log("info", "schema initialized", { dir: opts.schemaDir });

    return { empty, initialized: true };
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = load();
  const check = process.argv.includes("--check");

  setLevel(cfg.logLevel);

  const pool = createPool(cfg.databaseUrl);

  try {
    const report = await migrate(pool, { schemaDir: cfg.schemaDir, check });

    if (!report.empty) {
      process.stdout.write("схема на месте: база не пустая, контроллер её не трогает\n");
    } else {
      process.stdout.write(
        check ? "база пустая: при старте встанут схема и данные поставки\n" : "схема и данные поставки поставлены\n",
      );
    }
  } catch (err) {
    process.stderr.write(`схема: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
