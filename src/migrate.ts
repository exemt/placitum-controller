/*
 * Схема Postgres на первом старте.
 *
 * Схема принадлежит контроллеру: кто пишет в таблицы, тот их и объявляет.
 * Пустую базу контроллер поднимает сам из CONTROLLER_SCHEMA_DIR (в образе
 * /app/schema):
 *
 *   01-schema.sql   структура
 *   02-seed.sql     данные поставки
 *
 * Оба файла идут одной транзакцией: сорвавшийся старт не оставляет полбазы.
 * На базе, где схема уже есть, контроллер ничего не делает: обновлений схемы
 * на живой базе нет, схема поменялась -- установка ставится заново.
 *
 * pg_advisory_lock на время прохода: две реплики, стартующие на пустой базе
 * одновременно, иначе обе полезли бы её ставить.
 *
 * Отдельный запуск -- тот же проход, шаг установщика; --check только говорит,
 * пустая ли база:
 *
 *     node src/migrate.ts [--check]
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type pg from "pg";

import { createPool } from "./db.ts";
import { load } from "./config.ts";
import { log, setLevel } from "./log.ts";

export type MigrateOptions = {
  schemaDir: string;
  /** Только посмотреть, пустая ли база: ничего не ставить. */
  check?: boolean;
};

export type MigrateReport = {
  /** Схемы в базе не было. */
  empty: boolean;
  /** Схема и данные поставки поставлены в этот проход. */
  initialized: boolean;
};

/* Ключ advisory-блокировки; произвольное число, одно на контур. */
const LOCK_KEY = 7413001;

const FILES = ["01-schema.sql", "02-seed.sql"];

/* Таблица, по которой видно, что схема на месте. */
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

    /*
     * Файл целиком одним запросом: без параметров pg шлёт его простым
     * протоколом, и операторы идут внутри открытой транзакции. search_path
     * возвращается в конце: дамп выставляет его пустым (так делает pg_dump), а
     * соединение уходит обратно в пул.
     */
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

/* --- отдельный запуск ------------------------------------------------------- */

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
